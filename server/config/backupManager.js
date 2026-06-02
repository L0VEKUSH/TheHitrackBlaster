const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const defaultBackupRoot = path.resolve(__dirname, "..", "backups");
let backupTimer = null;
let backupInProgress = false;

const ensureBackupRoot = () => {
  fs.mkdirSync(defaultBackupRoot, { recursive: true });
  return defaultBackupRoot;
};

const createBackupDir = (customPath) => {
  const backupRoot = customPath ? path.resolve(customPath) : ensureBackupRoot();
  if (!path.isAbsolute(backupRoot)) {
    return path.resolve(backupRoot);
  }
  fs.mkdirSync(backupRoot, { recursive: true });
  return backupRoot;
};

const runDatabaseBackup = ({ outputPath, label } = {}) => {
  if (backupInProgress) {
    console.warn("⚠️  Database backup already in progress. Skipping duplicate backup.");
    return null;
  }

  if (!process.env.MONGO_URI) {
    console.error("❌ MONGO_URI is required to create a database backup.");
    return null;
  }

  if (!canRunBackups()) {
    console.error("❌ Automatic backups are unavailable because mongodump is not installed or configured.");
    return null;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupRoot = outputPath ? path.resolve(outputPath) : ensureBackupRoot();
  const finalDir = outputPath
    ? backupRoot
    : path.join(backupRoot, label ? `backup-${label}-${timestamp}` : `backup-${timestamp}`);
  const tempDir = outputPath
    ? path.join(path.dirname(backupRoot), `.tmp-backup-${timestamp}-${Math.random().toString(36).slice(2, 8)}`)
    : path.join(backupRoot, `.tmp-backup-${timestamp}-${Math.random().toString(36).slice(2, 8)}`);

  backupInProgress = true;
  try {
    fs.mkdirSync(tempDir, { recursive: true });
    const result = spawnSync("mongodump", ["--uri", process.env.MONGO_URI, "--out", tempDir], {
      stdio: "pipe",
      shell: false
    });

    if (result.error) {
      if (result.error.code === "ENOENT") {
        console.error("❌ mongodump is not installed or not available in PATH.");
      } else {
        console.error("❌ Failed to run mongodump:", result.error.message);
      }
      return null;
    }

    if (result.status !== 0) {
      const stderr = result.stderr.toString().trim();
      console.error(`❌ mongodump failed with exit code ${result.status}`);
      if (stderr) console.error(stderr);
      return null;
    }

    fs.renameSync(tempDir, finalDir);
    console.log(`✅ Database backup completed at ${finalDir}`);
    pruneOldBackups(backupRoot);
    return finalDir;
  } catch (err) {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    throw err;
  } finally {
    backupInProgress = false;
  }
};

const isMongodumpAvailable = () => {
  try {
    const result = spawnSync("mongodump", ["--version"], { stdio: "ignore", shell: false });
    return !result.error && result.status === 0;
  } catch (err) {
    return false;
  }
};

const canRunBackups = () => {
  // Allow backups when an external S3 bucket is configured or mongodump is available
  if (process.env.AUTO_BACKUP_S3_BUCKET) return true;
  return isMongodumpAvailable();
};

const pruneOldBackups = (backupRoot, maxBackups = Number(process.env.AUTO_BACKUP_RETENTION || 5)) => {
  try {
    const entries = fs.readdirSync(backupRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("backup-"))
      .map((entry) => ({
        name: entry.name,
        path: path.join(backupRoot, entry.name),
        time: fs.statSync(path.join(backupRoot, entry.name)).mtimeMs
      }))
      .sort((a, b) => b.time - a.time);

    const excess = entries.slice(maxBackups);
    excess.forEach((entry) => {
      fs.rmSync(entry.path, { recursive: true, force: true });
      console.log(`🧹 Removed old backup ${entry.path}`);
    });
  } catch (err) {
    console.error("⚠️  Failed to prune old backups:", err.message);
  }
};

const startAutomaticBackups = (intervalMinutes = Number(process.env.AUTO_BACKUP_INTERVAL_MINUTES || 15), maxBackups = Number(process.env.AUTO_BACKUP_RETENTION || 5)) => {
  if (!canRunBackups()) {
    console.warn("⚠️  Automatic backups are disabled because mongodump is not installed or AUTO_BACKUP_S3_BUCKET is not configured.");
    return null;
  }

  if (backupTimer) {
    clearInterval(backupTimer);
  }

  const intervalMs = Math.max(1, Number(intervalMinutes)) * 60 * 1000;
  backupTimer = setInterval(() => {
    runDatabaseBackup({ label: "auto" });
    pruneOldBackups(defaultBackupRoot, maxBackups);
  }, intervalMs);

  backupTimer.unref();
  console.log(`🔁 Automatic backups enabled every ${intervalMinutes} minutes`);
  return backupTimer;
};

const stopAutomaticBackups = () => {
  if (backupTimer) {
    clearInterval(backupTimer);
    backupTimer = null;
  }
};

module.exports = {
  runDatabaseBackup,
  startAutomaticBackups,
  stopAutomaticBackups,
  pruneOldBackups,
  ensureBackupRoot,
  defaultBackupRoot
  ,isMongodumpAvailable,
  canRunBackups
};
