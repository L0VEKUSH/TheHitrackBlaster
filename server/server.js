require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const xssClean = require("xss-clean");
const connectDB = require("./config/db");
const mongoose = require("mongoose");

/* ── ENVIRONMENT VALIDATION ────────────────────────── */
const requiredEnvVars = ["JWT_SECRET", "MONGO_URI"];
const missing = requiredEnvVars.filter(v => !process.env[v]);
if (missing.length > 0) {
  console.error(`❌ Missing environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

const app = express();
const server = http.createServer(app);
const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:5173")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);

/* ── SOCKET.IO WITH ERROR HANDLING ──────────────────── */
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error("CORS origin denied"));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    credentials: true
  },
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5,
  transports: ["websocket", "polling"],
  pingInterval: 25000,
  pingTimeout: 60000,
  maxHttpBufferSize: 1e6
});

/* ── DATABASE INITIALIZATION WITH RETRY ────────────── */
let dbConnected = false;
const initializeDB = async (retries = 3) => {
  try {
    await connectDB();
    dbConnected = true;
    console.log("✅ Database connected");
    
    // Non-blocking player stats rebuild
    try {
      const { rebuildAllPlayerStats } = require("./controllers/playerController");
      setImmediate(() => {
        rebuildAllPlayerStats().catch(err => 
          console.error("⚠️  Startup player stats rebuild failed:", err.message)
        );
      });
    } catch (err) {
      console.error("⚠️  Failed to schedule player stats rebuild:", err.message);
    }
  } catch (err) {
    console.error(`❌ Database connection failed (attempt ${4 - retries + 1}/3):`, err.message);
    if (retries > 0) {
      console.log(`⏳ Retrying in 5 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      return initializeDB(retries - 1);
    }
    console.error("❌ Failed to connect to database after 3 attempts");
    process.exit(1);
  }
};

initializeDB();

app.set("trust proxy", 1);
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error("CORS origin denied"));
    },
    credentials: true,
    optionsSuccessStatus: 200
  })
);
app.use(mongoSanitize());
app.use(xssClean());
app.use(morgan("dev"));
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: false, limit: "5mb" }));

// General Rate Limiting
const generalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500, message: { success: false, message: "Too many requests, please try again later." } });
app.use("/api", generalLimiter);

// Stricter Rate Limiting for Auth/Login
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { success: false, message: "Too many login attempts, please try again in 15 minutes." } });
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/admin/login", authLimiter);

require("./socket/liveSocket")(io);
const matchController = require("./controllers/matchController");
matchController.setSocket(io);

app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/matches", require("./routes/matchRoutes"));
app.use("/api/players", require("./routes/playerRoutes"));
app.use("/api/teams", require("./routes/teamRoutes"));
app.use("/api/news", require("./routes/newsRoutes"));
app.use("/api/tournaments", require("./routes/tournamentRoutes"));
app.use("/api/management", require("./routes/managementRoutes"));
app.use("/api/polls", require("./routes/pollRoutes"));
app.use("/api/about-me", require("./routes/aboutMeRoutes"));
app.use("/api/upload", require("./routes/uploadRoutes"));

const path = require("path");
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (req, res) =>
  res.json({ status: "ok", uptime: process.uptime(), time: new Date() })
);

app.use((req, res) =>
  res.status(404).json({ success: false, message: "Route not found" })
);

app.use((err, req, res, _next) => {
  console.error("🔥 Error:", err.message, err.stack);
  const fs = require("fs");
  const log = `[${new Date().toISOString()}] ${req.method} ${req.url}\n${err.stack}\n\n`;
  
  try {
    fs.appendFileSync(require("path").join(__dirname, "error.log"), log);
  } catch (writeErr) {
    console.error("Failed to write to error.log:", writeErr.message);
  }

  // Mongoose validation error
  if (err.name === "ValidationError") {
    return res.status(400).json({ success: false, message: "Validation failed", errors: Object.values(err.errors).map(e => e.message) });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    return res.status(409).json({ success: false, message: `Duplicate entry for ${field}` });
  }

  // Database connection error
  if (!dbConnected && err.message.includes("connection")) {
    return res.status(503).json({ success: false, message: "Database unavailable. Please try again later." });
  }

  // Default error
  const statusCode = err.status || err.statusCode || 500;
  res.status(statusCode).json({ success: false, message: err.message || "Internal server error" });
});

/* ── GRACEFUL SHUTDOWN ──────────────────────────────── */
const gracefulShutdown = async (signal) => {
  console.log(`\n⚠️  ${signal} received. Gracefully shutting down...`);
  
  // Stop accepting new connections
  server.close(() => {
    console.log("✅ Server closed");
  });

  // Disconnect Socket.IO clients
  io.disconnectSockets();

  // Close database connection
  try {
    await mongoose.disconnect();
    console.log("✅ Database disconnected");
  } catch (err) {
    console.error("Error disconnecting database:", err.message);
  }

  // Exit after 30 seconds max
  setTimeout(() => {
    console.error("❌ Could not close connections in time, forcefully shutting down");
    process.exit(1);
  }, 30000);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

/* ── UNHANDLED ERROR HANDLERS ──────────────────────── */
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
  const fs = require("fs");
  fs.appendFileSync(
    require("path").join(__dirname, "error.log"),
    `[${new Date().toISOString()}] UNCAUGHT EXCEPTION\n${err.stack}\n\n`
  );
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
  const fs = require("fs");
  fs.appendFileSync(
    require("path").join(__dirname, "error.log"),
    `[${new Date().toISOString()}] UNHANDLED REJECTION\n${reason}\n\n`
  );
});

/* ── MEMORY MONITORING ──────────────────────────────── */
setInterval(() => {
  const usage = process.memoryUsage();
  const heapUsedPercent = (usage.heapUsed / usage.heapTotal) * 100;
  
  if (heapUsedPercent > 85) {
    console.warn(`⚠️  High memory usage: ${heapUsedPercent.toFixed(2)}% (${Math.round(usage.heapUsed / 1024 / 1024)}MB)`);
  }

  // Force garbage collection if available (requires --expose-gc flag)
  if (global.gc && heapUsedPercent > 90) {
    console.log("🗑️  Forcing garbage collection...");
    global.gc();
  }
}, 60000); // Check every minute

const PORT = process.env.PORT || 5000;
server.listen(PORT, () =>
  console.log(`🚀 The Hitrack blaster→ http://localhost:${PORT}`)
);
