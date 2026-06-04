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
const { runDatabaseBackup, startAutomaticBackups, stopAutomaticBackups, canRunBackups } = require("./config/backupManager");
const mongoose = require("mongoose");
const { validatePayloadSize, sanitizeInput } = require("./middleware/validation");

/* ── ENVIRONMENT VALIDATION ────────────────────────── */
const requiredEnvVars = ["JWT_SECRET", "MONGO_URI"];
const missing = requiredEnvVars.filter(v => !process.env[v]);
if (missing.length > 0) {
  console.error(`❌ Missing environment variables: ${missing.join(", ")}`);
}

const app = express();
const server = http.createServer(app);
const defaultOrigins = [
  "http://localhost:5173",
  "https://the-hitrack-blaster-2clhawl0e-lovekush-kumar-s-projects.vercel.app",
  "https://the-hitrack-blaster-33exmbtlr-lovekush-kumar-s-projects.vercel.app",
  "https://*.vercel.app",
  "https://*.onrender.com"
];
const rawOrigins = [
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",") : []),
  ...(process.env.CLIENT_URL ? process.env.CLIENT_URL.split(",") : []),
  ...defaultOrigins
]
  .map((url) => url.trim().replace(/\/+$|\/$/g, "").toLowerCase())
  .filter(Boolean);
const allowedOrigins = Array.from(new Set(rawOrigins));
const allowAllOrigins = process.env.ALLOW_ALL_ORIGINS === "true" || allowedOrigins.includes("*");

const normalizeOrigin = (origin) => origin?.trim().replace(/\/+$/g, "");
const wildcardMatch = (origin, pattern) => {
  if (!pattern.includes("*")) return false;
  const escapedPattern = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escapedPattern}$`, "i").test(origin);
};
const isOriginAllowed = (origin) => {
  if (!origin || allowAllOrigins) return true;
  const normalizedOrigin = normalizeOrigin(origin).toLowerCase();
  return allowedOrigins.some((pattern) => {
    const normalizedPattern = normalizeOrigin(pattern).toLowerCase();
    if (normalizedPattern === normalizedOrigin) return true;
    return wildcardMatch(normalizedOrigin, normalizedPattern);
  });
};

// Debug: show configured allowed origins at startup
console.log(
  "🔧 Configured allowedOrigins:",
  allowAllOrigins ? "* (all origins allowed)" : allowedOrigins.join(", "),
  "allowAllOrigins:",
  allowAllOrigins
);

// Ensure a default port is set to avoid ReferenceError on startup
const PORT = process.env.PORT || 5000;

/* ── SOCKET.IO WITH ERROR HANDLING ──────────────────── */
// CORS origin check function used by both Express and Socket.IO
const corsOrigin = (origin, callback) => {
  if (isOriginAllowed(origin)) {
    return callback(null, true);
  }

  // Log denied origin for debugging
  try {
    console.warn(`🚫 CORS denied for origin: ${origin} | allowedOrigins: ${allowedOrigins.join(", ")}`);
  } catch (e) {
    // ignore
  }
  callback(new Error("CORS origin denied"));
};

app.use((req, res, next) => {
  if (req.url.includes("//")) {
    const normalizedUrl = req.url.replace(/\/{2,}/g, "/");
    if (normalizedUrl !== req.url) {
      console.log("🔧 Normalizing request URL:", req.url, "->", normalizedUrl);
      req.url = normalizedUrl;
    }
  }
  next();
});

const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    credentials: true
  },
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5,
  transports: ["polling", "websocket"],
  pingInterval: 25000,
  pingTimeout: 60000,
  maxHttpBufferSize: 1e6
});

/* ── DATABASE INITIALIZATION WITH RETRY ────────────── */
let dbConnected = false;
let autoBackupsStarted = false;
const initializeDB = async (retries = 3) => {
  try {
    await connectDB();
    dbConnected = true;
    console.log("✅ Database connected");

    if (!autoBackupsStarted) {
      const autoBackupIntervalMinutes = Number(process.env.AUTO_BACKUP_INTERVAL_MINUTES || 15);
      const autoBackupRetention = Number(process.env.AUTO_BACKUP_RETENTION || 5);
      // Only start automatic backups when the environment supports it
      if (canRunBackups()) {
        startAutomaticBackups(autoBackupIntervalMinutes, autoBackupRetention);
      } else {
        console.warn("⚠️ Automatic backups disabled: mongodump not available and no S3 configured");
      }
      autoBackupsStarted = true;
    }
    
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
    console.error("❌ Failed to connect to database after 3 attempts — starting server without DB connection. Requests depending on DB will return 503 until connection is restored.");
    // Do not exit here; allow server to start and return 503 for API calls until DB becomes available.
  }
};



app.set("trust proxy", 1);
app.use(helmet());
const corsOptions = {
  origin: allowAllOrigins ? true : corsOrigin,
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept", "X-Requested-With"],
  preflightContinue: false
};

app.use(cors(corsOptions));
// Ensure explicit OPTIONS preflight responses are served using the same options
app.options("*", cors(corsOptions));

// Always echo back allowed origins so browsers receive the CORS headers
app.use((req, res, next) => {
  const requestOrigin = req.headers.origin;
  try {
    if (requestOrigin && isOriginAllowed(requestOrigin)) {
      res.setHeader("Access-Control-Allow-Origin", requestOrigin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, X-Requested-With");
      res.setHeader("Vary", "Origin");
    }
  } catch (e) {
    // swallow errors here to avoid breaking request flow
  }
  next();
});

app.use(mongoSanitize());
app.use(xssClean());
app.use(morgan("dev"));
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: false, limit: "5mb" }));
app.use(validatePayloadSize);
app.use(sanitizeInput);

// Middleware to prefix relative /uploads/ paths with the server's absolute host URL
app.use((req, res, next) => {
  const originalJson = res.json;
  res.json = function (body) {
    const host = `${req.protocol}://${req.get("host")}`;
    const prefixUploads = (obj) => {
      if (!obj) return obj;
      if (typeof obj === "string") {
        if (obj.startsWith("/uploads/")) {
          return `${host}${obj}`;
        }
        return obj;
      }
      if (Array.isArray(obj)) {
        return obj.map(prefixUploads);
      }
      if (typeof obj === "object") {
        if (typeof obj.toJSON === "function") {
          return prefixUploads(obj.toJSON());
        }
        if (Object.prototype.toString.call(obj) === "[object Object]") {
          const newObj = {};
          for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
              newObj[key] = prefixUploads(obj[key]);
            }
          }
          return newObj;
        }
      }
      return obj;
    };
    try {
      const processedBody = prefixUploads(body);
      return originalJson.call(this, processedBody);
    } catch (err) {
      return originalJson.call(this, body);
    }
  };
  next();
});

// Block API requests when DB is not connected
// Block API requests when DB is not connected, but allow preflight OPTIONS through
app.use((req, res, next) => {
  // Allow CORS preflight to be handled by the cors middleware
  if (req.method === "OPTIONS") return next();

  // Allow health checks through even when DB is not connected
  if (req.path === "/api/health") return next();

  if (!dbConnected && req.path.startsWith("/api")) {
    return res.status(503).json({ success: false, message: "Service temporarily unavailable (database not connected)" });
  }
  next();
});

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
app.use("/api/admins", require("./routes/adminRoutes"));
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
const uploadsPath = path.join(__dirname, "public", "uploads");
app.use("/uploads", express.static(uploadsPath));
app.use("/uploads", (req, res) => {
  res.sendFile(path.join(uploadsPath, "default.png"), err => {
    if (err) {
      res.status(404).json({ success: false, message: "Image not found" });
    }
  });
});
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (req, res) =>
  res.json({ status: "ok", uptime: process.uptime(), time: new Date() })
);

app.get("/api/debug/cors", (req, res) => {
  const requestOrigin = req.headers.origin || null;
  const originAllowed = requestOrigin ? isOriginAllowed(requestOrigin) : false;
  res.json({
    success: true,
    requestOrigin,
    originAllowed,
    allowAllOrigins,
    allowedOrigins,
    env: {
      CLIENT_URL: process.env.CLIENT_URL || null,
      ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || null,
      NODE_ENV: process.env.NODE_ENV || null
    }
  });
});

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

  try {
    const backupPath = runDatabaseBackup({ label: `shutdown-${signal.toLowerCase()}` });
    if (backupPath) {
      console.log(`✅ Crash backup created before shutdown: ${backupPath}`);
    }
  } catch (err) {
    console.error("⚠️  Failed to create crash backup during shutdown:", err.message);
  }

  stopAutomaticBackups();
  
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
  try {
    const backupPath = runDatabaseBackup({ label: "uncaught-exception" });
    if (backupPath) {
      console.log(`✅ Crash backup created after uncaught exception: ${backupPath}`);
    }
  } catch (backupErr) {
    console.error("⚠️  Failed to create crash backup after uncaught exception:", backupErr.message);
  }
  const fs = require("fs");
  fs.appendFileSync(
    require("path").join(__dirname, "error.log"),
    `[${new Date().toISOString()}] UNCAUGHT EXCEPTION\n${err.stack}\n\n`
  );
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
  try {
    const backupPath = runDatabaseBackup({ label: "unhandled-rejection" });
    if (backupPath) {
      console.log(`✅ Crash backup created after unhandled rejection: ${backupPath}`);
    }
  } catch (backupErr) {
    console.error("⚠️  Failed to create crash backup after unhandled rejection:", backupErr.message);
  }
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

const startServer = async () => {
  // Initialize DB in background but don't block server start permanently
  initializeDB().catch(err => console.error("DB init error:", err && err.message));

  console.log(`Configured allowed origins: ${allowAllOrigins ? "* (all origins)" : allowedOrigins.join(", ")}`);
  server.listen(PORT, () => {
    console.log(`🚀 The Hitrack blaster running on port ${PORT}`);
  });
};

startServer();