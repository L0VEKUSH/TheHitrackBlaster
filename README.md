# HiTrack Blaster

Full-stack cricket platform with authoritative server-side live scoring, an admin scoring console, and real-time viewer updates.

## Project structure

```text
hitrack/
|-- client/              React and Vite frontend
|-- server/              Express, Mongoose, and Socket.IO backend
|-- package.json         Workspace commands
`-- .env.example         Safe environment template
```

## Local setup

1. Install all dependencies:

   ```powershell
   npm run install-all
   ```

2. Copy an environment template and replace every secret placeholder:

   ```powershell
   Copy-Item server/.env.example server/.env
   ```

   The server loads `server/.env` first and then the root `.env` for values that are still unset. Real `.env` files are ignored by Git. At minimum, configure `MONGO_URI` and a unique `JWT_SECRET` of at least 32 characters. `SETUP_SECRET` is required before the first admin can be created. Never put server secrets in `client/.env` or any `VITE_*` variable because Vite values are shipped to browsers.

3. Start the API and frontend in separate terminals:

   ```powershell
   npm run dev
   ```

   ```powershell
   npm run dev:client
   ```

   The defaults are `http://localhost:5000` for the API and `http://localhost:5173` for the frontend.
   The Vite development server binds to the local machine only and permits its two local origins (`localhost` and `127.0.0.1`).

4. Visit `/admin/setup` once to create the initial superadmin. Setup fails closed if `SETUP_SECRET` is missing and cannot be repeated after an admin exists.

## Production configuration

- Set `NODE_ENV=production`.
- Set `CLIENT_URL` and/or `ALLOWED_ORIGINS` to a comma-separated list of exact HTTPS origins. Production startup rejects wildcard origins and does not inherit localhost.
- Generate independent values for `JWT_SECRET`, `SETUP_SECRET`, and `ABOUT_ME_SECRET`; rotate any value that has ever appeared in source control or logs.
- Production rejects short/example secret values and rejects reuse of one value across multiple secret settings. `SETUP_SECRET` and `ABOUT_ME_SECRET` may be omitted to disable those features.
- Configure `VITE_API_URL` in the frontend deployment to the backend origin only, without `/api`.
- Configure `MEMORY_WARNING_LIMIT_MB` if the default 512 MiB RSS warning threshold is unsuitable.
- Configure `GENERAL_RATE_LIMIT_MAX` if the default 2,000 API requests per IP per 15 minutes does not fit expected viewer traffic. Authentication endpoints remain capped at 10 attempts per 15 minutes.
- Configure S3 upload variables when deployed on an ephemeral filesystem: `UPLOAD_S3_BUCKET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY`.

The CORS debug route is disabled by default and is never registered in production. For temporary local troubleshooting only, set `ENABLE_CORS_DEBUG=true` and request `/api/debug/cors`; turn it off afterward.

## Verification

From the repository root:

```powershell
npm test
npm run build
```

The root test command runs both server and client tests. The build command produces the Vite production bundle.

## Scoring-data migration

The event-history migration is dry-run by default:

```powershell
npm run migrate:scoring
```

Review the output and create a verified database backup before explicitly applying it:

```powershell
npm run migrate:scoring -- --apply
```

The migration preserves legacy innings as immutable replay baselines; it does not make old deliveries undoable if no historical delivery events exist.

## Backup and restore

Create a database backup:

```powershell
npm run backup:db -- --output server/backups/latest
```

Restore only from a verified dump, and target the intended database explicitly:

```powershell
npm run restore:db -- --dump server/backups/latest
```

Backups and uploaded runtime files are ignored by Git. Do not commit database dumps or credentials.

## Security notes

- Admin authentication is required for score mutations, match lifecycle changes, uploads, and management endpoints.
- JSON and URL-encoded bodies are limited to 1 MiB. Image uploads are limited to 5 MiB by Multer.
- Login, setup, and secret-unlock endpoints have stricter rate limits.
- Helmet, explicit CORS checks, MongoDB operator sanitization, payload-depth limits, and Mongoose validation are enabled.
- The API returns generic messages for unexpected server errors; detailed stacks stay in server logs.
- React escapes rendered text. Do not introduce `dangerouslySetInnerHTML` for names, commentary, news, or other stored content without a dedicated HTML sanitizer.

## Tech stack

- Frontend: React 18, Vite, Tailwind CSS, Axios, and Socket.IO Client
- Backend: Node.js, Express, MongoDB/Mongoose, Socket.IO, and JWT
