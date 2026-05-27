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
   The server requires `MONGO_URI` and `JWT_SECRET` at minimum. Optional values include `CLIENT_URL`, `PORT`, `SETUP_SECRET`, and `ABOUT_ME_SECRET`.

3. **Run Development Mode**:
   ```bash
   npm run dev
   ```
   *This will start both the server (port 5000) and client (port 5173) concurrently.*

4. **Admin Setup**:
   Visit `/admin/setup` to create the initial superadmin account.

## 🛠 Tech Stack
- **Frontend**: React 18, Vite, Tailwind CSS, Socket.IO Client, Axios, Day.js.
- **Backend**: Node.js, Express, MongoDB (Mongoose), Socket.IO, JWT.
- **Real-time**: WebSocket integration for live score updates.
```
