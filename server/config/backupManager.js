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

  const backupRoot = createBackupDir(outputPath);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(backupRoot, label ? `backup-${label}-${timestamp}` : `backup-${timestamp}`);

  backupInProgress = true;
  try {
    fs.mkdirSync(backupDir, { recursive: true });
    const result = spawnSync("mongodump", ["--uri", process.env.MONGO_URI, "--out", backupDir], {
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

    console.log(`✅ Database backup completed at ${backupDir}`);
    pruneOldBackups(backupRoot);
    return backupDir;
  } finally {
    backupInProgress = false;
  }
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
};
