# VaultKeep frontend

React (Vite) interface for VaultKeep: vault owners manage encrypted documents, nominees
and check-ins; nominees use a separate portal to unlock released documents.

## Requirements

- Node.js 18 or newer
- The VaultKeep backend running (see `../backend/README.md`)

## Local setup

1. Start the backend on port `3000`.
2. Open a terminal in this `frontend` directory and run `npm install`.
3. Run `npm run dev` and open http://localhost:5173.

In development, Vite proxies every `/api/*` request to `http://localhost:3000`, so the browser
talks to a single origin. Set `VITE_DEV_API_TARGET` in `.env.local` to point it elsewhere.

## Production build

```bash
npm run build      # outputs static files to dist/
```

- **Same origin (recommended):** serve `dist/` from the same host as the API, for example from
  Express or nginx on the EC2 instances behind the ALB. Leave `VITE_API_URL` empty.
- **Separate origin:** set `VITE_API_URL` to the ALB URL before building, e.g.
  `VITE_API_URL=http://vaultkeep-alb-123.us-east-1.elb.amazonaws.com npm run build`.

The app uses client-side routing, so the web server must return `index.html` for unknown paths.
`VITE_*` values are compiled into public JavaScript: never put secrets in them.

## Screens

| Route | Who | Purpose | Backend endpoints |
| --- | --- | --- | --- |
| `/` | public | Landing page | — |
| `/register`, `/login` | owner | Account creation (with check-in interval and grace period) and login | `POST /api/auth/register`, `POST /api/auth/login` |
| `/dashboard` | owner | Account status, check-in countdown, check-in button, inactive/released banners, setup checklist | `GET /api/checkin/status`, `POST /api/checkin` |
| `/documents` | owner | Upload (encrypted server-side with KMS), list, filter, download, delete | `/api/documents/*` |
| `/nominees` | owner | Add, edit, remove nominees; choose released documents; see notification status | `/api/nominees/*` |
| `/activity` | owner | Audit log with stats and filters, including nominee downloads | `GET /api/audit` |
| `/settings` | owner | Check-in interval and grace period, change password, check-in history | `PATCH /api/checkin/settings`, `POST /api/auth/change-password`, `GET /api/checkin/history` |
| `/nominee` | nominee | Enter email + one-time access code; explains "owner active" / "grace period running" states | `POST /api/nominee-portal/verify-code` |
| `/nominee/vault` | nominee | List and download released documents | `GET /api/nominee-portal/documents[/:id/download]` |

## Notes

- The owner JWT is stored in `localStorage`. The nominee JWT (valid for 2 hours) is stored in
  `sessionStorage`, so it is discarded when the tab closes.
- Downloads are fetched with the `Authorization` header and saved as a blob. The server decrypts
  the file, and every download is recorded in the audit log.
- The 25 MB upload limit is checked in the browser to match the backend's multer limit.

## Project structure

```text
src/
  api/client.js          fetch wrapper and every API call
  context/AuthContext    owner session (login, register, logout, profile refresh)
  components/            Layout (sidebar), ProtectedRoute, Alert, StatusBadge, Logo
  pages/                 owner screens
  pages/nominee/         nominee portal screens
  styles.css             all styling
```
