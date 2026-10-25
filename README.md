# VaultKeep backend starter

Minimal Express API foundation for the VaultKeep cloud computing lab project.

## Requirements

- Node.js 18 or newer
- PostgreSQL available locally (the API requires a `DATABASE_URL` at startup)

## Local setup

1. Open a terminal in this `backend` directory.
2. Install dependencies with `npm install`.
3. Copy `.env.example` to `.env` and set `DATABASE_URL` to your local PostgreSQL connection string.
4. Start the API with `npm run dev` (or `npm start`).

The API listens on port `3000` by default. Set `PORT` in `.env` to change it.

## Starter endpoints

- `GET /` — API identity and running status
- `GET /api/health` — process health
- `GET /api/health/database` — PostgreSQL connectivity

## Project structure

```text
src/
  app.js                 Express middleware and route registration
  server.js              Server startup and shutdown
  config/database.js     PostgreSQL connection pool
  routes/health.js       Health endpoints
```

Do not commit `.env` or put AWS credentials in source files. The next implementation step is to agree on the database schema and API contract with the frontend teammate.

