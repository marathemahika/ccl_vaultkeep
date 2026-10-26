const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { logEvent } = require('./auditService');

/**
 * Generates an 8-character human-friendly one-time access code (e.g. VK-8F4A2B).
 */
function generateAccessCode() {
  const bytes = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `VK-${bytes}`;
}

/**
 * Checks for users whose check-in window has passed, marks them 'inactive',
 * starts their grace period, and generates one-time access codes for their nominees.
 * In production AWS: Called by an AWS Lambda scheduled via Amazon EventBridge.
 */
async function processOverdueAccounts() {
  const client = await pool.connect();
  const summary = { processedUsers: [], errors: [] };

  try {
    const overdueResult = await client.query('SELECT * FROM v_overdue_accounts');
    const overdueAccounts = overdueResult.rows;

    for (const user of overdueAccounts) {
      try {
        await client.query('BEGIN');

        // Transition user to inactive and set grace period release deadline
        const updateResult = await client.query(
          `UPDATE users
           SET status = 'inactive',
               inactive_flagged_at = now(),
               access_release_at = now() + make_interval(days => grace_period_days)
           WHERE id = $1 AND status = 'active'
           RETURNING id, email, full_name, inactive_flagged_at, access_release_at`,
          [user.id]
        );

        if (updateResult.rows.length === 0) {
          await client.query('ROLLBACK');
          continue; // User status may have changed concurrently
        }

        const updatedUser = updateResult.rows[0];

        // Fetch nominees for this user
        const nomineeResult = await client.query(
          `SELECT id, email, full_name FROM nominees WHERE owner_id = $1`,
          [user.id]
        );

        const generatedCodes = [];

        // Generate and store hashed one-time access codes for nominees
        for (const nominee of nomineeResult.rows) {
          const rawCode = generateAccessCode();
          const codeHash = await bcrypt.hash(rawCode, 10);

          await client.query(
            `UPDATE nominees
             SET access_code_hash = $1,
                 access_code_expires_at = now() + interval '30 days',
                 access_code_used_at = NULL,
                 notified_inactive_at = now()
             WHERE id = $2`,
            [codeHash, nominee.id]
          );

          generatedCodes.push({
            nomineeId: nominee.id,
            nomineeEmail: nominee.email,
            nomineeName: nominee.full_name,
            oneTimeAccessCode: rawCode, // In production, sent via Amazon SNS / SES
          });
        }

        await client.query('COMMIT');

        await logEvent({
          actorType: 'system',
          ownerId: user.id,
          action: 'lifecycle.flag_inactive',
          success: true,
          details: {
            reason: 'Check-in overdue',
            lastCheckinAt: user.last_checkin_at,
            accessReleaseAt: updatedUser.access_release_at,
            nomineesNotifiedCount: generatedCodes.length,
          },
        });

        summary.processedUsers.push({
          userId: user.id,
          email: user.email,
          fullName: user.full_name,
          accessReleaseAt: updatedUser.access_release_at,
          nomineeCodes: generatedCodes,
        });
      } catch (userErr) {
        await client.query('ROLLBACK');
        console.error(`Error processing overdue user ${user.id}:`, userErr);
        summary.errors.push({ userId: user.id, error: userErr.message });
      }
    }
  } finally {
    client.release();
  }

  return summary;
}

/**
 * Checks for inactive accounts whose grace period has expired,
 * and transitions them to 'released', permanently unlocking documents for nominees.
 */
async function processReleaseDueAccounts() {
  const client = await pool.connect();
  const summary = { releasedUsers: [], errors: [] };

  try {
    const releaseDueResult = await client.query('SELECT * FROM v_release_due_accounts');
    const dueAccounts = releaseDueResult.rows;

    for (const user of dueAccounts) {
      try {
        await client.query('BEGIN');

        const updateResult = await client.query(
          `UPDATE users
           SET status = 'released',
               access_released_at = now()
           WHERE id = $1 AND status = 'inactive'
           RETURNING id, email, full_name, access_released_at`,
          [user.id]
        );

        if (updateResult.rows.length === 0) {
          await client.query('ROLLBACK');
          continue;
        }

        const releasedUser = updateResult.rows[0];

        // Mark nominees as notified for release
        await client.query(
          `UPDATE nominees
           SET notified_released_at = now()
           WHERE owner_id = $1`,
          [user.id]
        );

        await client.query('COMMIT');

        await logEvent({
          actorType: 'system',
          ownerId: user.id,
          action: 'lifecycle.release_vault',
          success: true,
          details: {
            reason: 'Grace period expired',
            accessReleasedAt: releasedUser.access_released_at,
          },
        });

        summary.releasedUsers.push({
          userId: user.id,
          email: user.email,
          fullName: user.full_name,
          accessReleasedAt: releasedUser.access_released_at,
        });
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`Error releasing vault for user ${user.id}:`, err);
        summary.errors.push({ userId: user.id, error: err.message });
      }
    }
  } finally {
    client.release();
  }

  return summary;
}

module.exports = {
  generateAccessCode,
  processOverdueAccounts,
  processReleaseDueAccounts,
};
