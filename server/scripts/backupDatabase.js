require("dotenv/config");
const path = require("path");
const { runDatabaseBackup } = require("../config/backupManager");

const args = process.argv.slice(2);
const getArgValue = (name) => {
  const index = args.findIndex((arg) => arg === `--${name}` || arg === `-${name[0]}`);
  if (index === -1) return undefined;
  return args[index + 1];
};

const outputPath = getArgValue("output");
const backupPath = runDatabaseBackup({
  outputPath: outputPath ? path.resolve(outputPath) : undefined,
  label: "manual"
});

if (!backupPath) {
  process.exit(1);
}
