const express = require('express');
const pool = require('../config/database');
const { authenticateOwner } = require('../middleware/auth');

const router = express.Router();

router.use(authenticateOwner);

/**
 * GET /api/audit
 * Returns append-only immutable audit logs for the authenticated owner's vault.
 */
router.get('/', async (req, res) => {
  const userId = req.user.id;
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
  const actionFilter = req.query.action ? req.query.action.trim() : null;

  try {
    let query = `
      SELECT id, occurred_at, actor_type, actor_id, document_id, action, success,
             ip_address, user_agent, details
      FROM audit_log
      WHERE owner_id = $1
    `;
    const params = [userId];

    if (actionFilter) {
      params.push(actionFilter);
      query += ` AND action = $2`;
    }

    query += ` ORDER BY occurred_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await pool.query(query, params);

    // Compute basic statistics for the owner dashboard
    const statsResult = await pool.query(
      `SELECT
         COUNT(*) AS total_events,
         COUNT(*) FILTER (WHERE action LIKE 'document.%') AS document_events,
         COUNT(*) FILTER (WHERE action LIKE 'auth.%') AS auth_events,
         COUNT(*) FILTER (WHERE action LIKE 'nominee.%') AS nominee_events,
         COUNT(*) FILTER (WHERE success = false) AS failed_events
       FROM audit_log
       WHERE owner_id = $1`,
      [userId]
    );

    return res.json({
      stats: statsResult.rows[0],
      logs: result.rows,
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return res.status(500).json({ error: 'Failed to retrieve audit logs.' });
  }
});

module.exports = router;
