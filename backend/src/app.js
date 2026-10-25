const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const healthRouter = require('./routes/health');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/', (_req, res) => {
  res.json({ name: 'VaultKeep API', status: 'running' });
});

app.use('/api/health', healthRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

module.exports = app;
