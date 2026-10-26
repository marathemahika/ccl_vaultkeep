const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const healthRouter = require('./routes/health');
const authRouter = require('./routes/auth');
const checkinRouter = require('./routes/checkin');
const documentsRouter = require('./routes/documents');
const nomineesRouter = require('./routes/nominees');
const nomineePortalRouter = require('./routes/nomineePortal');
const auditRouter = require('./routes/audit');
const lifecycleRouter = require('./routes/lifecycle');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/', (_req, res) => {
  res.json({ name: 'VaultKeep API', status: 'running', version: '1.0.0' });
});

// Mount modular API routes
app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/checkin', checkinRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/nominees', nomineesRouter);
app.use('/api/nominee-portal', nomineePortalRouter);
app.use('/api/audit', auditRouter);
app.use('/api/lifecycle', lifecycleRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

module.exports = app;
