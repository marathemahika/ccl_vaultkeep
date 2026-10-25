const express = require('express');
const pool = require('../config/database');

const router = express.Router();

router.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'vaultkeep-api' });
});

router.get('/database', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    console.error('Database health check failed:', error.message);
    res.status(503).json({ status: 'error', database: 'unavailable' });
  }
});

module.exports = router;
