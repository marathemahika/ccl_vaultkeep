const express = require('express');
const pool = require('../config/database');
const { authenticateOwner } = require('../middleware/auth');
const { logEvent, sanitizeIpAddress } = require('../services/auditService');

const router = express.Router();

// All check-in endpoints require an authenticated vault owner
router.use(authenticateOwner);

/**
 * POST /api/checkin
 * Record a manual heartbeat / check-in.
 * If the user's account was flagged 'inactive' during the grace period,
 * checking in restores it back to 'active' and cancels pending access release.
 */
router.post('/', async (req, res) => {
  const userId = req.user.id;
  const clientIp = sanitizeIpAddress(req.ip);

  try {
    // Check current account status
    const currentStatusResult = await pool.query(
      `SELECT status, checkin_interval_days, grace_period_days FROM users WHERE id = $1`,
      [userId]
    );

    if (currentStatusResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const { status, checkin_interval_days, grace_period_days } = currentStatusResult.rows[0];

    if (status === 'released') {
      return res.status(400).json({
        error: 'Vault access has already been permanently released to nominees.',
      });
    }

    let statusResetQuery = '';
    const wasInactive = status === 'inactive';

    if (wasInactive) {
      statusResetQuery = `, status = 'active', inactive_flagged_at = NULL, access_release_at = NULL`;
    }

    // Update user record
    const updateResult = await pool.query(
      `UPDATE users
       SET last_checkin_at = now()
           ${statusResetQuery}
       WHERE id = $1
       RETURNING id, status, last_checkin_at, checkin_interval_days, grace_period_days,
                 (now() + make_interval(days => checkin_interval_days)) AS next_checkin_due_at`,
      [userId]
    );

    const updatedUser = updateResult.rows[0];

    // Insert record in check_ins history table
    await pool.query(
      `INSERT INTO check_ins (user_id, checked_in_at, method, ip_address)
       VALUES ($1, now(), 'manual', $2)`,
      [userId, clientIp]
    );

    // Audit log
    await logEvent({
      actorType: 'owner',
      actorId: userId,
      ownerId: userId,
      action: 'checkin.manual',
      success: true,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: {
        wasInactive,
        restoredToActive: wasInactive,
      },
    });

    return res.json({
      message: wasInactive
        ? 'Check-in recorded! Your account status has been restored to active, and pending nominee releases were cancelled.'
        : 'Check-in recorded successfully.',
      status: updatedUser.status,
      lastCheckinAt: updatedUser.last_checkin_at,
      nextCheckinDueAt: updatedUser.next_checkin_due_at,
      daysRemaining: updatedUser.checkin_interval_days,
    });
  } catch (error) {
    console.error('Error during check-in:', error);
    return res.status(500).json({ error: 'Failed to record check-in.' });
  }
});

/**
 * GET /api/checkin/status
 * Get countdown details, grace period timing, and check-in timeline.
 */
router.get('/status', async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await pool.query(
      `SELECT id, status, last_checkin_at, checkin_interval_days, grace_period_days,
              inactive_flagged_at, access_release_at, access_released_at,
              (last_checkin_at + make_interval(days => checkin_interval_days)) AS next_checkin_due_at,
              CASE
                WHEN status = 'active' THEN
                  GREATEST(0, ROUND(EXTRACT(EPOCH FROM ((last_checkin_at + make_interval(days => checkin_interval_days)) - now())) / 86400)::integer)
                ELSE 0
              END AS days_remaining,
              CASE
                WHEN status = 'inactive' AND access_release_at IS NOT NULL THEN
                  GREATEST(0, ROUND(EXTRACT(EPOCH FROM (access_release_at - now())) / 3600)::integer)
                ELSE NULL
              END AS grace_period_hours_remaining
       FROM users
       WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const row = result.rows[0];

    return res.json({
      status: row.status,
      lastCheckinAt: row.last_checkin_at,
      nextCheckinDueAt: row.next_checkin_due_at,
      daysRemaining: row.days_remaining,
      checkinIntervalDays: row.checkin_interval_days,
      gracePeriodDays: row.grace_period_days,
      inactiveFlaggedAt: row.inactive_flagged_at,
      accessReleaseAt: row.access_release_at,
      gracePeriodHoursRemaining: row.grace_period_hours_remaining,
      accessReleasedAt: row.access_released_at,
    });
  } catch (error) {
    console.error('Error fetching check-in status:', error);
    return res.status(500).json({ error: 'Failed to retrieve check-in status.' });
  }
});

/**
 * PATCH /api/checkin/settings
 * Adjust checkin interval and grace period.
 */
router.patch('/settings', async (req, res) => {
  const userId = req.user.id;
  const { checkin_interval_days, grace_period_days } = req.body;

  if (checkin_interval_days === undefined && grace_period_days === undefined) {
    return res.status(400).json({ error: 'Provide checkin_interval_days or grace_period_days to update.' });
  }

  const updates = [];
  const values = [userId];
  let paramIndex = 2;

  if (checkin_interval_days !== undefined) {
    const interval = Number(checkin_interval_days);
    if (isNaN(interval) || interval < 1 || interval > 365) {
      return res.status(400).json({ error: 'checkin_interval_days must be between 1 and 365.' });
    }
    updates.push(`checkin_interval_days = $${paramIndex++}`);
    values.push(interval);
  }

  if (grace_period_days !== undefined) {
    const grace = Number(grace_period_days);
    if (isNaN(grace) || grace < 0 || grace > 90) {
      return res.status(400).json({ error: 'grace_period_days must be between 0 and 90.' });
    }
    updates.push(`grace_period_days = $${paramIndex++}`);
    values.push(grace);
  }

  try {
    const result = await pool.query(
      `UPDATE users
       SET ${updates.join(', ')}
       WHERE id = $1
       RETURNING checkin_interval_days, grace_period_days`,
      values
    );

    await logEvent({
      actorType: 'owner',
      actorId: userId,
      ownerId: userId,
      action: 'checkin.settings_updated',
      success: true,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: result.rows[0],
    });

    return res.json({
      message: 'Check-in settings updated successfully.',
      settings: result.rows[0],
    });
  } catch (error) {
    console.error('Error updating check-in settings:', error);
    return res.status(500).json({ error: 'Failed to update check-in settings.' });
  }
});

/**
 * GET /api/checkin/history
 * Retrieve recent check-in events.
 */
router.get('/history', async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await pool.query(
      `SELECT id, checked_in_at, method, ip_address
       FROM check_ins
       WHERE user_id = $1
       ORDER BY checked_in_at DESC
       LIMIT 50`,
      [userId]
    );

    return res.json({ history: result.rows });
  } catch (error) {
    console.error('Error fetching check-in history:', error);
    return res.status(500).json({ error: 'Failed to fetch check-in history.' });
  }
});

module.exports = router;
