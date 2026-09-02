"use strict";

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env"), override: false });
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Match = require("../models/Match");
const Player = require("../models/Player");
const {
  normalizePlayerName,
  resolveParticipantEntries,
} = require("../utils/playingXIResolver");

const SIDE_CONFIG = [
  { field: "teamAPlayingXI", squadField: "squadA", teamField: "teamA" },
  { field: "teamBPlayingXI", squadField: "squadB", teamField: "teamB" },
];

const legacyNameOf = (entry) => {
  if (typeof entry === "string") return entry.trim().replace(/\s+/g, " ");
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return "";
  return String(entry.nameSnapshot || entry.name || entry.fullName || "").trim().replace(/\s+/g, " ");
};

const normalizeLegacySquad = (squad) => {
  const names = [];
  const invalidEntries = [];
  const duplicateNames = [];
  const seen = new Set();
  (Array.isArray(squad) ? squad : []).forEach((entry, index) => {
    const name = legacyNameOf(entry);
    if (!name) {
      invalidEntries.push(index);
      return;
    }
    const normalized = normalizePlayerName(name);
    if (seen.has(normalized)) {
      duplicateNames.push(name);
      return;
    }
    seen.add(normalized);
    names.push(name);
  });
  return { names, invalidEntries, duplicateNames };
};

const recordedWicketsForTeam = (match, teamName) => [match?.innings1, match?.innings2]
  .filter((innings) => innings && innings.battingTeam === teamName)
  .reduce((maximum, innings) => Math.max(maximum, Number(innings.wickets || 0)), 0);

const planTeamBackfill = ({ match, players, field, squadField, teamField }) => {
  if (match?.[field] != null) {
    return { status: "skipped", code: "ALREADY_CONFIGURED", field };
  }
  if (!Array.isArray(match?.[squadField]) || match[squadField].length === 0) {
    return { status: "skipped", code: "LEGACY_SQUAD_MISSING", field };
  }

  const normalized = normalizeLegacySquad(match[squadField]);
  if (normalized.invalidEntries.length > 0) {
    return {
      status: "skipped",
      code: "INVALID_LEGACY_SQUAD_ENTRY",
      field,
      invalidEntries: normalized.invalidEntries,
    };
  }
  if (normalized.names.length < 2 || normalized.names.length > 11) {
    return {
      status: "skipped",
      code: "INVALID_LEGACY_SQUAD_SIZE",
      field,
      playerCount: normalized.names.length,
      duplicateNames: normalized.duplicateNames,
    };
  }

  const resolved = resolveParticipantEntries({
    entries: normalized.names,
    players,
    side: field,
    list: "playingXI",
  });
  if (resolved.validationIssues.length > 0 || resolved.resolutionIssues.length > 0) {
    return {
      status: "unresolved",
      code: "PLAYER_RESOLUTION_REQUIRED",
      field,
      validationIssues: resolved.validationIssues,
      resolutionIssues: resolved.resolutionIssues,
      duplicateNames: normalized.duplicateNames,
    };
  }

  const recordedWickets = recordedWicketsForTeam(match, match[teamField]);
  const maxWickets = resolved.participants.length - 1;
  if (recordedWickets > maxWickets) {
    return {
      status: "skipped",
      code: "UNSAFE_RECORDED_WICKET_COUNT",
      field,
      recordedWickets,
      maxWickets,
    };
  }

  return {
    status: "planned",
    code: "READY",
    field,
    duplicateNames: normalized.duplicateNames,
    value: {
      playingXI: resolved.participants,
      substitutes: [],
      captainId: "",
      captainName: "",
      captainNameSnapshot: "",
      wicketKeeperId: "",
      wicketKeeperName: "",
      wicketKeeperNameSnapshot: "",
      selectedAt: null,
    },
  };
};

const planMatchBackfill = (match, players) => {
  const sides = {};
  const updates = {};
  for (const config of SIDE_CONFIG) {
    const result = planTeamBackfill({ match, players, ...config });
    sides[config.field] = result;
    if (result.status === "planned") updates[config.field] = result.value;
  }
  return {
    matchId: String(match?._id || ""),
    teams: { teamA: match?.teamA || "", teamB: match?.teamB || "" },
    sides,
    updates,
    changed: Object.keys(updates).length > 0,
  };
};

const parseArguments = (argv = process.argv.slice(2)) => {
  const apply = argv.includes("--apply");
  const matchIndex = argv.indexOf("--match");
  const matchId = matchIndex >= 0 ? argv[matchIndex + 1] : null;
  if (matchIndex >= 0 && !matchId) throw new Error("--match requires a MongoDB ObjectId");
  if (matchId && !mongoose.Types.ObjectId.isValid(matchId)) throw new Error("--match must be a valid MongoDB ObjectId");
  return { apply, matchId };
};

const guardedApplySide = async (matchId, field, value) => Match.updateOne(
  {
    _id: matchId,
    $or: [
      { [field]: { $exists: false } },
      { [field]: null },
    ],
  },
  { $set: { [field]: value } },
  { runValidators: true },
);

const runMigration = async ({ apply = false, matchId = null } = {}) => {
  await connectDB();
  const players = await Player.find({}).select("_id name fullName team").lean();
  const query = matchId
    ? { _id: matchId }
    : { $or: [{ teamAPlayingXI: null }, { teamBPlayingXI: null }] };
  const cursor = Match.find(query).lean().cursor();
  const summary = {
    mode: apply ? "apply" : "dry-run",
    scannedMatches: 0,
    plannedSides: 0,
    appliedSides: 0,
    unresolvedSides: 0,
    skippedSides: 0,
    concurrentSkips: 0,
    errors: 0,
  };

  for await (const match of cursor) {
    summary.scannedMatches += 1;
    try {
      const plan = planMatchBackfill(match, players);
      for (const result of Object.values(plan.sides)) {
        if (result.status === "planned") summary.plannedSides += 1;
        else if (result.status === "unresolved") summary.unresolvedSides += 1;
        else summary.skippedSides += 1;
      }
      console.log(JSON.stringify({ mode: summary.mode, ...plan }));
      if (!apply) continue;

      for (const [field, value] of Object.entries(plan.updates)) {
        const write = await guardedApplySide(match._id, field, value);
        if (write.modifiedCount === 1) summary.appliedSides += 1;
        else summary.concurrentSkips += 1;
      }
    } catch (error) {
      summary.errors += 1;
      console.error(JSON.stringify({ matchId: String(match?._id || ""), code: "MIGRATION_ERROR", message: error.message }));
    }
  }
  console.log(JSON.stringify(summary));
  if (summary.errors > 0) process.exitCode = 2;
  return summary;
};

const main = async () => {
  const options = parseArguments();
  try {
    await runMigration(options);
  } finally {
    await mongoose.disconnect();
  }
};

if (require.main === module) {
  main().catch((error) => {
    console.error(`Playing XI migration failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  guardedApplySide,
  legacyNameOf,
  normalizeLegacySquad,
  parseArguments,
  planMatchBackfill,
  planTeamBackfill,
  recordedWicketsForTeam,
  runMigration,
};
