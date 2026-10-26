const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { generateOwnerToken, authenticateOwner } = require('../middleware/auth');
const { logEvent } = require('../services/auditService');
const { rateLimit } = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
});

const router = express.Router();

const BCRYPT_ROUNDS = 12;
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;

/**
 * Helper to validate email format.
 */
function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * POST /api/auth/register
 * Register a new vault owner account.
 */
router.post('/register', async (req, res) => {
  const { email, password, full_name, checkin_interval_days = 30, grace_period_days = 7 } = req.body;

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }

  if (!password || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
  }

  if (!full_name || typeof full_name !== 'string' || !full_name.trim()) {
    return res.status(400).json({ error: 'Full name is required.' });
  }

  const intervalDays = Number(checkin_interval_days);
  const graceDays = Number(grace_period_days);

  if (isNaN(intervalDays) || intervalDays < 1 || intervalDays > 365) {
    return res.status(400).json({ error: 'checkin_interval_days must be between 1 and 365.' });
  }

  if (isNaN(graceDays) || graceDays < 0 || graceDays > 90) {
    return res.status(400).json({ error: 'grace_period_days must be between 0 and 90.' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    // Check if email already registered
    const existing = await pool.query(
      'SELECT id FROM users WHERE lower(email) = $1',
      [normalizedEmail]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const insertResult = await pool.query(
      `INSERT INTO users (
        email,
        password_hash,
        full_name,
        checkin_interval_days,
        grace_period_days,
        last_checkin_at
      )
      VALUES ($1, $2, $3, $4, $5, now())
      RETURNING id, email, full_name, status, checkin_interval_days, grace_period_days, last_checkin_at, created_at`,
      [normalizedEmail, passwordHash, full_name.trim(), intervalDays, graceDays]
    );

    const user = insertResult.rows[0];

    // Log the registration event
    await logEvent({
      actorType: 'owner',
      actorId: user.id,
      ownerId: user.id,
      action: 'auth.register',
      success: true,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { email: user.email },
    });

    const token = generateOwnerToken(user);

    return res.status(201).json({
      message: 'Account registered successfully.',
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        status: user.status,
        checkinIntervalDays: user.checkin_interval_days,
        gracePeriodDays: user.grace_period_days,
        lastCheckinAt: user.last_checkin_at,
        createdAt: user.created_at,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ error: 'Internal server error during registration.' });
  }
});

/**
 * POST /api/auth/login
 * Authenticate vault owner and issue a JWT token.
 */
router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const userResult = await pool.query(
      `SELECT id, email, password_hash, full_name, status, checkin_interval_days,
              grace_period_days, last_checkin_at, failed_login_count, locked_until
       FROM users
       WHERE lower(email) = $1`,
      [normalizedEmail]
    );

    if (userResult.rows.length === 0) {
      await logEvent({
        actorType: 'owner',
        action: 'auth.login.failed',
        success: false,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        details: { reason: 'User not found', email: normalizedEmail },
      });
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = userResult.rows[0];

    // Check account lockout
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const minutesRemaining = Math.ceil(
        (new Date(user.locked_until).getTime() - Date.now()) / (60 * 1000)
      );
      await logEvent({
        actorType: 'owner',
        actorId: user.id,
        ownerId: user.id,
        action: 'auth.login.locked',
        success: false,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        details: { minutesRemaining },
      });
      return res.status(423).json({
        error: `Account is temporarily locked. Try again in ${minutesRemaining} minute(s).`,
      });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      const newFailedCount = user.failed_login_count + 1;
      let lockUntilClause = null;

      if (newFailedCount >= MAX_FAILED_LOGINS) {
        await pool.query(
          `UPDATE users 
           SET failed_login_count = $1, 
               locked_until = now() + interval '${LOCKOUT_MINUTES} minutes'
           WHERE id = $2`,
          [newFailedCount, user.id]
        );
      } else {
        await pool.query(
          `UPDATE users SET failed_login_count = $1 WHERE id = $2`,
          [newFailedCount, user.id]
        );
      }

      await logEvent({
        actorType: 'owner',
        actorId: user.id,
        ownerId: user.id,
        action: 'auth.login.failed',
        success: false,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        details: { failedCount: newFailedCount },
      });

      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Login successful: reset failed logins and update checkin
    // If account was flagged 'inactive' (grace period), logging in restores it to 'active'
    let updatedStatus = user.status;
    let statusResetQuery = '';
    if (user.status === 'inactive') {
      updatedStatus = 'active';
      statusResetQuery = `, status = 'active', inactive_flagged_at = NULL, access_release_at = NULL`;
    }

    await pool.query(
      `UPDATE users
       SET failed_login_count = 0,
           locked_until = NULL,
           last_checkin_at = now()
           ${statusResetQuery}
       WHERE id = $1`,
      [user.id]
    );

    // Record check-in
    await pool.query(
      `INSERT INTO check_ins (user_id, checked_in_at, method, ip_address)
       VALUES ($1, now(), 'login', $2)`,
      [user.id, req.ip && req.ip.includes('.') ? req.ip : null]
    );

    // Write audit log
    await logEvent({
      actorType: 'owner',
      actorId: user.id,
      ownerId: user.id,
      action: 'auth.login.success',
      success: true,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: {
        method: 'password',
        statusRestoredToActive: user.status === 'inactive',
      },
    });

    const token = generateOwnerToken({
      id: user.id,
      email: user.email,
      full_name: user.full_name,
    });

    return res.json({
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        status: updatedStatus,
        checkinIntervalDays: user.checkin_interval_days,
        gracePeriodDays: user.grace_period_days,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error during login.' });
  }
});

/**
 * GET /api/auth/me
 * Fetch current authenticated user's profile and check-in timeline.
 */
router.get('/me', authenticateOwner, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, email, full_name, status, checkin_interval_days, grace_period_days,
              last_checkin_at, inactive_flagged_at, access_release_at, access_released_at,
              created_at,
              (last_checkin_at + make_interval(days => checkin_interval_days)) AS next_checkin_due_at,
              CASE
                WHEN status = 'active' THEN
                  GREATEST(0, ROUND(EXTRACT(EPOCH FROM ((last_checkin_at + make_interval(days => checkin_interval_days)) - now())) / 86400)::integer)
                ELSE 0
              END AS days_remaining
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const me = result.rows[0];

    return res.json({
      id: me.id,
      email: me.email,
      fullName: me.full_name,
      status: me.status,
      checkinIntervalDays: me.checkin_interval_days,
      gracePeriodDays: me.grace_period_days,
      lastCheckinAt: me.last_checkin_at,
      nextCheckinDueAt: me.next_checkin_due_at,
      daysRemaining: me.days_remaining,
      inactiveFlaggedAt: me.inactive_flagged_at,
      accessReleaseAt: me.access_release_at,
      accessReleasedAt: me.access_released_at,
      createdAt: me.created_at,
    });
  } catch (error) {
    console.error('Error in /me:', error);
    return res.status(500).json({ error: 'Failed to fetch user profile.' });
  }
});

/**
 * POST /api/auth/change-password
 * Change password for authenticated vault owner.
 */
router.post('/change-password', authenticateOwner, async (req, res) => {
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Current password and new password are required.' });
  }

  if (new_password.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
  }

  try {
    const userResult = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user.id]
    );

    const match = await bcrypt.compare(current_password, userResult.rows[0].password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Incorrect current password.' });
    }

    const newHash = await bcrypt.hash(new_password, BCRYPT_ROUNDS);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.user.id]);

    await logEvent({
      actorType: 'owner',
      actorId: req.user.id,
      ownerId: req.user.id,
      action: 'auth.password_changed',
      success: true,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.json({ message: 'Password updated successfully.' });
  } catch (error) {
    console.error('Error changing password:', error);
    return res.status(500).json({ error: 'Failed to update password.' });
  }
});

module.exports = router;
