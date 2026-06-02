# The Hitrack blaster– Full Stack Cricket Platform

A professional, real-time cricket platform with live scoring, news, and rankings.

## 📁 Project Structure

```text
hitrack/
├── client/              # Frontend (React + Vite + Tailwind)
│   ├── src/
│   │   ├── components/  # Reusable UI components
│   │   ├── context/     # Auth & global state
│   │   ├── hooks/       # Custom React hooks
│   │   ├── pages/       # Page components (Public & Admin)
│   │   └── services/    # API & Socket integration
│   └── tailwind.config.js
├── server/              # Backend (Node.js + Express + MongoDB)
│   ├── config/          # DB & general config
│   ├── controllers/     # Route logic
│   ├── models/          # Mongoose schemas
│   ├── routes/          # API endpoints
│   ├── socket/          # Real-time scoring logic
│   └── server.js        # Entry point
└── package.json         # Workspace management
```

## 🚀 Getting Started

1. **Install Dependencies**:
   ```bash
   npm run install-all
   ```

2. **Environment Setup**:
   Copy the sample environment file and update it with your local values:
   ```bash
   copy server\.env.example server\.env
   ```
   The server requires `MONGO_URI` and `JWT_SECRET` at minimum.

   > Do not commit real credentials or connection strings into the repository. Keep secrets in `server/.env` and deploy sensitive values through the platform environment settings.

   Optional environment variables for deployment include:
   - `CLIENT_URL` — the frontend origin used for CORS, e.g. `https://the-hitrack-blaster-2clhawl0e-lovekush-kumar-s-projects.vercel.app`
   - `ALLOWED_ORIGINS` — comma-separated allowed origins, supports wildcards like `https://*.vercel.app`
   - `PORT` — backend port when running locally
   - `SETUP_SECRET` — secure key for initial admin setup
   - `ABOUT_ME_SECRET` — secure key for about-me data access

   If you deploy the frontend separately, also add a client environment file in `client/.env`:
   ```bash
   VITE_API_URL=https://thehitrackblaster.onrender.com
   ```

   Example deployment env values for backend:
   ```bash
   CLIENT_URL=https://the-hitrack-blaster-33exmbtlr-lovekush-kumar-s-projects.vercel.app
   ALLOWED_ORIGINS=https://the-hitrack-blaster-33exmbtlr-lovekush-kumar-s-projects.vercel.app,https://*.vercel.app,https://*.onrender.com
   ```

3. **Run Development Mode**:
   ```bash
   npm run dev
   ```
   *This will start both the server (port 5000) and client (port 5173) concurrently.*

4. **Admin Setup**:
   Visit `/admin/setup` to create the initial superadmin account.

## 💾 Backup & Restore
The project includes database backup and restore support in `server/config/backupManager.js` and `server/scripts/restoreDatabase.js`.

### Create a backup
From the project root:
```bash
cd server
npm run backup:db -- --output ./backups/latest
```

### Restore from a dump
If you have a MongoDB dump folder, restore it with:
```bash
cd server
npm run restore:db -- --dump ./backups/latest
```

If your MongoDB contains player data already and the app is not showing it, make sure the backend is using the correct `MONGO_URI` for that database.

## 🧪 CORS Debugging
The backend exposes a debug endpoint to verify which origins are allowed and what the current CORS config is.

### Check CORS status
```bash
curl https://thehitrackblaster.onrender.com/api/debug/cors
```

This returns:
- `requestOrigin`
- `originAllowed`
- `allowAllOrigins`
- `allowedOrigins`
- current `CLIENT_URL` and `ALLOWED_ORIGINS`

## 🛠 Tech Stack
- **Frontend**: React 18, Vite, Tailwind CSS, Socket.IO Client, Axios, Day.js.
- **Backend**: Node.js, Express, MongoDB (Mongoose), Socket.IO, JWT.
- **Real-time**: WebSocket integration for live score updates.
