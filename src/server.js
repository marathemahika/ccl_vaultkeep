require('dotenv').config();

const app = require('./app');
const port = Number(process.env.PORT) || 3000;

const server = app.listen(port, () => {
  console.log(`VaultKeep API listening on port ${port}`);
});

const shutdown = () => {
  server.close(() => {
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
