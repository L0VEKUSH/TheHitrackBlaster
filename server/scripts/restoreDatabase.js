require("dotenv/config");
const path = require("path");
const { spawnSync } = require("child_process");

const args = process.argv.slice(2);
const getArgValue = (name) => {
  const index = args.findIndex((arg) => arg === `--${name}` || arg === `-${name[0]}`);
  if (index === -1) return undefined;
  return args[index + 1];
};

const dumpPath = getArgValue("dump") || getArgValue("path");
const mongoUri = process.env.MONGO_URI;

if (!mongoUri) {
  console.error("❌ MONGO_URI environment variable is required.");
  process.exit(1);
}

if (!dumpPath) {
  console.error("❌ Provide a dump path with --dump <path>.");
  process.exit(1);
}

const resolvedDumpPath = path.resolve(dumpPath);
const command = "mongorestore";
const result = spawnSync(command, ["--uri", mongoUri, "--drop", resolvedDumpPath], {
  stdio: "inherit",
  shell: false
});

if (result.error) {
  if (result.error.code === "ENOENT") {
    console.error("❌ mongorestore is not installed or not available in PATH.");
  } else {
    console.error("❌ Failed to run mongorestore:", result.error.message);
  }
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`❌ mongorestore failed with exit code ${result.status}`);
  process.exit(result.status);
}

console.log(`✅ Database restored from ${resolvedDumpPath}`);
