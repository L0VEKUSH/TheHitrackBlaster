const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), override: false });
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const connectDB = require("./config/db");
const { runDatabaseBackup, startAutomaticBackups, stopAutomaticBackups, canRunBackups } = require("./config/backupManager");
const mongoose = require("mongoose");
const { validatePayloadSize, sanitizeInput } = require("./middleware/validation");
const { validateProductionSecrets } = require("./utils/securityConfig");

/* ── ENVIRONMENT VALIDATION ────────────────────────── */
const requiredEnvVars = ["JWT_SECRET", "MONGO_URI"];
const missing = requiredEnvVars.filter(v => !process.env[v]);
if (missing.length > 0) {
  console.error(`❌ Missing environment variables: ${missing.join(", ")}`);
  if (process.env.NODE_ENV === "production") process.exit(1);
}

if (process.env.NODE_ENV === "production") {
  const secretErrors = validateProductionSecrets(process.env);
  if (secretErrors.length > 0) {
    for (const error of secretErrors) console.error(`❌ ${error}`);
    process.exit(1);
  }
}

const app = express();
const server = http.createServer(app);
const defaultOrigins = process.env.NODE_ENV === "production" ? [] : ["http://localhost:5173"];
const rawOrigins = [
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",") : []),
  ...(process.env.CLIENT_URL ? process.env.CLIENT_URL.split(",") : []),
  ...defaultOrigins
]
  .map((url) => url.trim().replace(/\/+$|\/$/g, "").toLowerCase())
  .filter(Boolean);
const allowedOrigins = Array.from(new Set(rawOrigins));
if (process.env.NODE_ENV === "production" && (
  allowedOrigins.length === 0 || allowedOrigins.some((origin) => origin.includes("*"))
)) {
  console.error("❌ Production CORS requires at least one explicit CLIENT_URL or ALLOWED_ORIGINS entry; wildcards are not accepted");
  process.exit(1);
}
const allowAllOrigins = process.env.NODE_ENV !== "production" &&
  (process.env.ALLOW_ALL_ORIGINS === "true" || allowedOrigins.includes("*"));

const normalizeOrigin = (origin) => origin?.trim().replace(/\/+$/g, "");
const wildcardMatch = (origin, pattern) => {
  if (pattern.includes("*") && process.env.NODE_ENV === "production") return false;
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
let statsRebuildScheduled = false;
let databaseConnectInFlight = null;
let databaseReconnectTimer = null;
let shuttingDown = false;
const databaseReconnectIntervalMs = Math.max(
  5000,
  Number(process.env.DB_RECONNECT_INTERVAL_MS) || 15000
);

const clearDatabaseReconnect = () => {
  if (databaseReconnectTimer) clearTimeout(databaseReconnectTimer);
  databaseReconnectTimer = null;
};

const scheduleDatabaseReconnect = () => {
  if (shuttingDown || dbConnected || databaseReconnectTimer) return;
  databaseReconnectTimer = setTimeout(() => {
    databaseReconnectTimer = null;
    initializeDB(1).catch((error) => {
      console.error("❌ Background database reconnect failed:", error.message);
    });
  }, databaseReconnectIntervalMs);
  databaseReconnectTimer.unref?.();
};

mongoose.connection.on("connected", () => {
  dbConnected = true;
  clearDatabaseReconnect();
});
mongoose.connection.on("disconnected", () => {
  dbConnected = false;
  scheduleDatabaseReconnect();
});
mongoose.connection.on("error", () => { dbConnected = false; });
const initializeDB = async (maxAttempts = 3) => {
  if (dbConnected) return true;
  if (databaseConnectInFlight) return databaseConnectInFlight;

  const attempts = Math.max(1, Number(maxAttempts) || 1);
  databaseConnectInFlight = (async () => {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        await connectDB();
        dbConnected = true;
        clearDatabaseReconnect();
        console.log("✅ Database connected");

        if (!autoBackupsStarted) {
          const autoBackupIntervalMinutes = Number(process.env.AUTO_BACKUP_INTERVAL_MINUTES || 15);
          const autoBackupRetention = Number(process.env.AUTO_BACKUP_RETENTION || 5);
          if (canRunBackups()) {
            startAutomaticBackups(autoBackupIntervalMinutes, autoBackupRetention);
          } else {
            console.warn("⚠️ Automatic backups disabled: mongodump not available and no S3 configured");
          }
          autoBackupsStarted = true;
        }

        if (!statsRebuildScheduled) {
          statsRebuildScheduled = true;
          try {
            const { rebuildAllPlayerStats } = require("./controllers/playerController");
            setImmediate(() => {
              rebuildAllPlayerStats().catch(err =>
                console.error("⚠️  Startup player stats rebuild failed:", err.message)
              );
            });
          } catch (err) {
            statsRebuildScheduled = false;
            console.error("⚠️  Failed to schedule player stats rebuild:", err.message);
          }
        }
        return true;
      } catch (err) {
        console.error(`❌ Database connection failed (attempt ${attempt}/${attempts}):`, err.message);
        if (attempt < attempts) {
          console.log("⏳ Retrying in 5 seconds...");
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
    }

    console.error(`❌ Database unavailable after ${attempts} attempt(s). API requests will return 503; a non-overlapping background reconnect is scheduled.`);
    scheduleDatabaseReconnect();
    return false;
  })();

  try {
    return await databaseConnectInFlight;
  } finally {
    databaseConnectInFlight = null;
  }
};



app.set("trust proxy", 1);
app.use(helmet());
const corsOptions = {
  origin: allowAllOrigins ? true : corsOrigin,
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept", "X-Requested-With", "Idempotency-Key", "If-Match-Version"],
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
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, X-Requested-With, Idempotency-Key, If-Match-Version");
      res.setHeader("Vary", "Origin");
    }
  } catch (e) {
    // swallow errors here to avoid breaking request flow
  }
  next();
});

app.use(morgan("dev"));
app.use(validatePayloadSize);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(mongoSanitize());
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
// A disconnected viewer polls every five seconds. The default leaves room for
// several viewers behind one NAT while the auth endpoints remain much stricter.
const generalRateLimitMax = Math.max(100, Number(process.env.GENERAL_RATE_LIMIT_MAX) || 2000);
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: generalRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests, please try again later." }
});
app.use("/api", generalLimiter);

// Stricter Rate Limiting for Auth/Login
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { success: false, message: "Too many login attempts, please try again in 15 minutes." } });
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/admin/login", authLimiter);
app.use("/api/auth/admin/setup", authLimiter);
app.use("/api/auth/unlock-secret", authLimiter);

require("./socket/liveSocket")(io);
const matchController = require("./controllers/matchController");
matchController.setSocket(io);
require("./controllers/liveScoringController").setSocket(io);

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

app.get("/api/health", (req, res) => {
  const database = mongoose.connection.readyState === 1 ? "connected" : "unavailable";
  res.status(database === "connected" ? 200 : 503).json({
    status: database === "connected" ? "ok" : "degraded",
    database,
    uptime: process.uptime(),
    time: new Date()
  });
});

if (process.env.NODE_ENV !== "production" && process.env.ENABLE_CORS_DEBUG === "true") app.get("/api/debug/cors", (req, res) => {
  const requestOrigin = req.headers.origin || null;
  const originAllowed = requestOrigin ? isOriginAllowed(requestOrigin) : false;
  res.json({
    success: true,
    requestOrigin,
    originAllowed,
    allowAllOrigins,
    allowedOrigins
  });
});

app.use((req, res) =>
  res.status(404).json({ success: false, message: "Route not found" })
);

app.use((err, req, res, _next) => {
  // Keep diagnostics in server logs without recording query strings, tokens,
  // request bodies, or credentials. Production clients receive generic 5xx text.
  console.error("🔥 Request error:", req.method, req.path, err.stack || err.message);

  // Mongoose validation error
  if (err.name === "ValidationError") {
    return res.status(400).json({ success: false, message: "Validation failed", errors: Object.values(err.errors).map(e => e.message) });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || "unique field";
    return res.status(409).json({ success: false, message: `Duplicate entry for ${field}` });
  }

  if (err.name === "MulterError") {
    const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    return res.status(status).json({
      success: false,
      message: err.code === "LIMIT_FILE_SIZE" ? "Uploaded image exceeds the 5 MiB limit" : "Invalid upload request"
    });
  }

  // Database connection error
  if (!dbConnected && String(err.message || "").includes("connection")) {
    return res.status(503).json({ success: false, message: "Database unavailable. Please try again later." });
  }

  // Default error
  const statusCode = err.status || err.statusCode || 500;
  const publicMessage = statusCode >= 500
    ? "Internal server error"
    : (err.message || "Request failed");
  res.status(statusCode).json({ success: false, message: publicMessage });
});

/* ── GRACEFUL SHUTDOWN ──────────────────────────────── */
const gracefulShutdown = async (signal) => {
  console.log(`\n⚠️  ${signal} received. Gracefully shutting down...`);
  shuttingDown = true;
  clearDatabaseReconnect();
  clearInterval(memoryMonitor);

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
  console.error("❌ Uncaught Exception:", err?.stack || err?.message || "Unknown exception");
  try {
    const backupPath = runDatabaseBackup({ label: "uncaught-exception" });
    if (backupPath) {
      console.log(`✅ Crash backup created after uncaught exception: ${backupPath}`);
    }
  } catch (backupErr) {
    console.error("⚠️  Failed to create crash backup after uncaught exception:", backupErr.message);
  }
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled Rejection:", reason?.stack || reason?.message || String(reason));
  try {
    const backupPath = runDatabaseBackup({ label: "unhandled-rejection" });
    if (backupPath) {
      console.log(`✅ Crash backup created after unhandled rejection: ${backupPath}`);
    }
  } catch (backupErr) {
    console.error("⚠️  Failed to create crash backup after unhandled rejection:", backupErr.message);
  }
});

/* ── MEMORY MONITORING ──────────────────────────────── */
const memoryMonitor = setInterval(() => {
  const usage = process.memoryUsage();
  const configuredLimitMb = Math.max(128, Number(process.env.MEMORY_WARNING_LIMIT_MB) || 512);
  const rssMb = usage.rss / 1024 / 1024;
  
  if (rssMb > configuredLimitMb) {
    console.warn(`⚠️  High process memory: ${rssMb.toFixed(0)}MB RSS (warning threshold ${configuredLimitMb}MB)`);
  }
}, 60000); // Check every minute
memoryMonitor.unref();

const startServer = async () => {
  // Initialize DB in background but don't block server start permanently
  initializeDB().catch(err => console.error("DB init error:", err && err.message));

  console.log(`Configured allowed origins: ${allowAllOrigins ? "* (all origins)" : allowedOrigins.join(", ")}`);
  server.listen(PORT, () => {
    console.log(`🚀 The Hitrack blaster running on port ${PORT}`);
  });
};

startServer();
