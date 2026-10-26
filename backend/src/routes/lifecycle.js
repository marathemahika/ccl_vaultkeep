const express = require('express');
const { processOverdueAccounts, processReleaseDueAccounts } = require('../services/lifecycleService');

const router = express.Router();

const LIFECYCLE_API_KEY = process.env.LIFECYCLE_API_KEY || 'vaultkeep-internal-lifecycle-key';

/**
 * POST /api/lifecycle/check
 * Triggered periodically by AWS EventBridge + AWS Lambda (or a scheduled runner).
 * Detects overdue accounts (initiating grace periods & nominee notifications)
 * and finalizes access releases for expired grace periods.
 */
router.post('/check', async (req, res) => {
  const providedKey = req.headers['x-lifecycle-key'] || req.query.key;

  if (!providedKey || providedKey !== LIFECYCLE_API_KEY) {
    return res.status(403).json({ error: 'Unauthorized lifecycle trigger.' });
  }

  try {
    const overdueSummary = await processOverdueAccounts();
    const releaseSummary = await processReleaseDueAccounts();

    return res.json({
      message: 'Lifecycle check completed successfully.',
      timestamp: new Date().toISOString(),
      overdue: overdueSummary,
      released: releaseSummary,
    });
  } catch (error) {
    console.error('Error executing lifecycle check:', error);
    return res.status(500).json({ error: 'Lifecycle check execution failed.' });
  }
});

module.exports = router;
