"use strict";

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env"), override: false });
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Match = require("../models/Match");
const {
  hasMeaningfulLegacyState,
  snapshotInningsState,
} = require("../services/scoringEngine");

const apply = process.argv.includes("--apply");
const matchArgIndex = process.argv.indexOf("--match");
const matchId = matchArgIndex >= 0 ? process.argv[matchArgIndex + 1] : null;

const inningsKeys = ["innings1", "innings2", "superOverInnings1", "superOverInnings2"];

const legacyInningsWasClosed = (match, key) => {
  if (key === "innings1") return Number(match.currentInnings) === 2 || Boolean(match.innings2) || match.status === "completed";
  if (key === "innings2") return match.status === "completed" && !match.isSuperOver;
  if (key === "superOverInnings1") return match.isSuperOver && (Number(match.currentInnings) === 2 || Boolean(match.superOverInnings2));
  if (key === "superOverInnings2") return match.isSuperOver && match.status === "completed";
  return false;
};

const migrateMatch = (match) => {
  let changed = false;
  const initialized = [];

  for (const key of inningsKeys) {
    const innings = match[key];
    if (!innings) continue;
    const raw = innings.toObject({ depopulate: true });
    const events = Array.isArray(raw.events) ? raw.events : [];
    const wasClosed = legacyInningsWasClosed(match, key);
    if (!raw.historyBase && events.length === 0 && (hasMeaningfulLegacyState(raw) || wasClosed)) {
      const baseline = snapshotInningsState(raw);
      if (wasClosed) {
        baseline.isDone = true;
        baseline.endReason ||= "legacyClosed";
      }
      innings.historyBase = baseline;
      innings.historyBoundaryReason = "legacy-score-import";
      innings.rulesVersion = 1;
      match.markModified(key);
      initialized.push(key);
      changed = true;
    } else if (raw.historyBase && wasClosed && !raw.historyBase.isDone) {
      innings.historyBase = { ...raw.historyBase, isDone: true, endReason: raw.historyBase.endReason || "legacyClosed" };
      match.markModified(key);
      changed = true;
    }
    if (raw.eventHistoryInitialized !== true) {
      innings.eventHistoryInitialized = true;
      match.markModified(key);
      changed = true;
    }
  }

  if (match.schemaVersion !== 2) {
    match.schemaVersion = 2;
    changed = true;
  }
  if ((match.currentInnings === 2 || match.innings2) && Number(match.target || 0) === 0 && match.innings1) {
    match.target = Math.max(0, Number(match.innings1.runs || 0)) + 1;
    changed = true;
  }
  if (!match.phase || match.phase === "upcoming") {
    const phase = match.status === "completed"
      ? "finished"
      : match.status === "live"
        ? (match.currentInnings === 2 ? "secondInnings" : "firstInnings")
        : "upcoming";
    if (match.phase !== phase) {
      match.phase = phase;
      changed = true;
    }
  }

  return { changed, initialized };
};

const main = async () => {
  if (matchId && !mongoose.Types.ObjectId.isValid(matchId)) throw new Error("--match must be a valid MongoDB ObjectId");
  await connectDB();
  const query = matchId ? { _id: matchId } : {};
  const cursor = Match.find(query).cursor();
  const summary = { scanned: 0, changed: 0, applied: 0, skipped: 0, errors: 0 };

  for await (const match of cursor) {
    summary.scanned += 1;
    try {
      const result = migrateMatch(match);
      if (!result.changed) {
        summary.skipped += 1;
        continue;
      }
      summary.changed += 1;
      console.log(`${apply ? "APPLY" : "DRY-RUN"} match=${match._id} baselines=${result.initialized.join(",") || "none"}`);
      if (apply) {
        await match.save();
        summary.applied += 1;
      }
    } catch (error) {
      summary.errors += 1;
      console.error(`SKIP match=${match._id} reason=${error.message}`);
    }
  }

  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", ...summary }));
  if (summary.errors > 0) process.exitCode = 2;
};

main()
  .catch((error) => {
    console.error(`Migration failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
