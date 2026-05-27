require("dotenv/config");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const args = process.argv.slice(2);
const getArgValue = (name) => {
  const index = args.findIndex((arg) => arg === `--${name}` || arg === `-${name[0]}`);
  if (index === -1) return undefined;
  return args[index + 1];
};

const outputPath = getArgValue("output") || path.join(process.cwd(), "backups", `backup-${new Date().toISOString().replace(/[:.]/g, "-")}`);
const mongoUri = process.env.MONGO_URI;

if (!mongoUri) {
  console.error("❌ MONGO_URI environment variable is required.");
  process.exit(1);
}

try {
  fs.mkdirSync(outputPath, { recursive: true });
} catch (err) {
  console.error(`❌ Failed to create backup directory ${outputPath}:`, err.message);
  process.exit(1);
}

const command = "mongodump";
const result = spawnSync(command, ["--uri", mongoUri, "--out", outputPath], {
  stdio: "inherit",
  shell: false
});

if (result.error) {
  if (result.error.code === "ENOENT") {
    console.error("❌ mongodump is not installed or not available in PATH.");
  } else {
    console.error("❌ Failed to run mongodump:", result.error.message);
  }
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`❌ mongodump failed with exit code ${result.status}`);
  process.exit(result.status);
}

console.log(`✅ Database backup completed at ${outputPath}`);
