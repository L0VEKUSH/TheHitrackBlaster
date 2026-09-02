"use strict";

const path = require("path");
const {
  normalizeIdentityText,
  normalizeParticipant,
  rankPlayerCandidates,
} = require("../utils/playerIdentity");

const INNINGS_KEYS = ["innings1", "innings2", "superOverInnings1", "superOverInnings2"];
const NON_DELIVERY_WICKETS = new Set(["retiredHurt", "retiredOut", "timedOut"]);
const FIELDER_REQUIRED_WICKETS = new Set(["caught", "stumped", "runOut"]);

const clean = (value) => String(value == null ? "" : value).trim();
const idOf = (value) => clean(value?._id || value?.playerId || value);

function buildPlayerIndex(players) {
  const byId = new Map();
  const byName = new Map();
  for (const player of Array.isArray(players) ? players : []) {
    const playerId = idOf(player);
    const nameSnapshot = clean(player?.name);
    if (!playerId || !nameSnapshot) continue;
    const normalized = { ...player, playerId, nameSnapshot };
    byId.set(playerId, normalized);
    const identityNames = new Set([player?.name, player?.fullName]
      .map(normalizeIdentityText)
      .filter(Boolean));
    for (const key of identityNames) {
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(normalized);
    }
  }
  return { players: [...byId.values()], byId, byName };
}

function resolveLegacyIdentity(value, team, index) {
  const participant = normalizeParticipant(value);
  if (participant.playerId) {
    const player = index.byId.get(participant.playerId);
    if (!player) return { status: "missing-id", participant, candidates: [] };
    return {
      status: "resolved",
      participant: {
        playerId: participant.playerId,
        nameSnapshot: participant.nameSnapshot || player.nameSnapshot,
      },
      player,
    };
  }

  const nameKey = normalizeIdentityText(participant.nameSnapshot);
  if (!nameKey) return { status: "missing-name", participant, candidates: [] };
  const exact = index.byName.get(nameKey) || [];
  const teamKey = normalizeIdentityText(team);
  const exactForTeam = teamKey
    ? exact.filter((player) => normalizeIdentityText(player.team) === teamKey)
    : [];
  const safe = exactForTeam.length === 1
    ? exactForTeam
    : exact.length === 1
      ? exact
      : [];
  if (safe.length === 1) {
    return {
      status: "resolved",
      participant: { playerId: safe[0].playerId, nameSnapshot: participant.nameSnapshot || safe[0].nameSnapshot },
      player: safe[0],
    };
  }

  const candidates = exact.length > 0
    ? rankPlayerCandidates(participant.nameSnapshot, exact, { team, limit: 8 })
    : rankPlayerCandidates(participant.nameSnapshot, index.players, { team, limit: 8 });
  return { status: exact.length > 1 ? "ambiguous" : "fuzzy-confirmation-required", participant, candidates };
}

function assignIdentity(target, {
  idField,
  snapshotField,
  legacyNameField,
  team,
  sourcePath,
  required = false,
}, index, issues) {
  if (!target || typeof target !== "object") return null;
  const input = {
    playerId: target[idField],
    nameSnapshot: target[snapshotField] || target[legacyNameField],
  };
  const resolution = resolveLegacyIdentity(input, team, index);
  if (resolution.status !== "resolved") {
    if (required || input.playerId || input.nameSnapshot) {
      issues.push({
        sourcePath,
        team: clean(team),
        nameSnapshot: clean(input.nameSnapshot),
        playerId: clean(input.playerId),
        reason: resolution.status,
        candidates: resolution.candidates,
      });
    }
    return null;
  }
  target[idField] = resolution.participant.playerId;
  target[snapshotField] = resolution.participant.nameSnapshot;
  if (legacyNameField && !clean(target[legacyNameField])) target[legacyNameField] = resolution.participant.nameSnapshot;
  return resolution.participant;
}

function migrateParticipantArray(items, team, sourcePath, index, issues) {
  if (!Array.isArray(items)) return;
  items.forEach((item, itemIndex) => assignIdentity(item, {
    idField: "playerId",
    snapshotField: "nameSnapshot",
    legacyNameField: "name",
    team,
    sourcePath: `${sourcePath}.${itemIndex}`,
    required: true,
  }, index, issues));
}

function migrateEventIdentity(event, battingTeam, bowlingTeam, sourcePath, index, issues) {
  if (!event || typeof event !== "object") return;
  if (event.type === "ADD_BATTER" || event.type === "ADD_BOWLER") {
    const team = event.type === "ADD_BATTER" ? battingTeam : bowlingTeam;
    assignIdentity(event, {
      idField: "playerId",
      snapshotField: "nameSnapshot",
      legacyNameField: "playerName",
      team,
      sourcePath: `${sourcePath}.player`,
      required: true,
    }, index, issues);
    return;
  }
  if (event.type !== "BALL") return;
  const adjustment = event.extraType === "penalty" || event.extraType === "bonus";
  const nonDelivery = event.isWicket && NON_DELIVERY_WICKETS.has(event.wicketType);
  for (const descriptor of [
    ["batterId", "batterNameSnapshot", "batterName", battingTeam, "batter", !adjustment],
    ["nonStrikerId", "nonStrikerNameSnapshot", "nonStrikerName", battingTeam, "nonStriker", !adjustment],
    ["bowlerId", "bowlerNameSnapshot", "bowlerName", bowlingTeam, "bowler", !adjustment && !nonDelivery],
    ["outPlayerId", "outPlayerNameSnapshot", "outPlayerName", battingTeam, "outPlayer", Boolean(event.isWicket)],
    ["fielderId", "fielderNameSnapshot", "fielderName", bowlingTeam, "fielder", event.isWicket && FIELDER_REQUIRED_WICKETS.has(event.wicketType)],
  ]) {
    const [idField, snapshotField, legacyNameField, team, label, required] = descriptor;
    assignIdentity(event, {
      idField,
      snapshotField,
      legacyNameField,
      team,
      sourcePath: `${sourcePath}.${label}`,
      required,
    }, index, issues);
  }
}

function migrateReferenceList(items, team, sourcePath, index, issues) {
  if (!Array.isArray(items)) return items;
  const canonical = [];
  let complete = true;
  items.forEach((item, itemIndex) => {
    const resolution = resolveLegacyIdentity(item, team, index);
    if (resolution.status === "resolved") {
      canonical.push(resolution.participant);
      return;
    }
    complete = false;
    const participant = normalizeParticipant(item);
    issues.push({
      sourcePath: `${sourcePath}.${itemIndex}`,
      team: clean(team),
      nameSnapshot: participant.nameSnapshot,
      playerId: participant.playerId,
      reason: resolution.status,
      candidates: resolution.candidates,
    });
  });
  return complete ? canonical : items;
}

function migrateMatchParticipants(match, index, issues) {
  for (const side of [
    { participantField: "teamAParticipants", rosterField: "teamAPlayingXI", squadField: "squadA", teamField: "teamA" },
    { participantField: "teamBParticipants", rosterField: "teamBPlayingXI", squadField: "squadB", teamField: "teamB" },
  ]) {
    const team = clean(match[side.teamField]);
    const roster = match[side.rosterField];
    if (roster && typeof roster === "object") {
      roster.playingXI = migrateReferenceList(
        roster.playingXI,
        team,
        `${side.rosterField}.playingXI`,
        index,
        issues,
      );
      roster.substitutes = migrateReferenceList(
        roster.substitutes,
        team,
        `${side.rosterField}.substitutes`,
        index,
        issues,
      );
      assignIdentity(roster, {
        idField: "captainId",
        snapshotField: "captainNameSnapshot",
        legacyNameField: "captainName",
        team,
        sourcePath: `${side.rosterField}.captain`,
      }, index, issues);
      assignIdentity(roster, {
        idField: "wicketKeeperId",
        snapshotField: "wicketKeeperNameSnapshot",
        legacyNameField: "wicketKeeperName",
        team,
        sourcePath: `${side.rosterField}.wicketKeeper`,
      }, index, issues);
    }

    const source = Array.isArray(roster?.playingXI) && roster.playingXI.length > 0
      ? roster.playingXI
      : Array.isArray(match[side.participantField]) && match[side.participantField].length > 0
        ? match[side.participantField]
        : match[side.squadField];
    if (Array.isArray(source) && source.length > 0) {
      match[side.participantField] = migrateReferenceList(
        source,
        team,
        side.participantField,
        index,
        issues,
      );
    }
  }
}

function backfillFreeHitMarkers(events, initialPending = false) {
  let pending = Boolean(initialPending);
  const ordered = (Array.isArray(events) ? events : [])
    .map((event, index) => ({ event, index }))
    .sort((left, right) => Number(left.event?.sequence || left.index) - Number(right.event?.sequence || right.index));
  for (const { event } of ordered) {
    if (!event || event.type !== "BALL") continue;
    event.isFreeHit = pending;
    const adjustment = event.extraType === "penalty" || event.extraType === "bonus";
    const nonDelivery = event.isWicket && NON_DELIVERY_WICKETS.has(event.wicketType);
    if (adjustment || nonDelivery) continue;
    if (event.extraType === "noBall" || event.extraType === "no-ball") pending = true;
    else {
      const legal = typeof event.legalDelivery === "boolean"
        ? event.legalDelivery
        : event.extraType !== "wide";
      if (legal) pending = false;
    }
  }
  return pending;
}

function migrateInnings(innings, sourcePath, index, issues) {
  if (!innings || typeof innings !== "object") return;
  const battingTeam = clean(innings.battingTeam);
  const bowlingTeam = clean(innings.bowlingTeam);
  migrateParticipantArray(innings.batsmen, battingTeam, `${sourcePath}.batsmen`, index, issues);
  migrateParticipantArray(innings.bowlers, bowlingTeam, `${sourcePath}.bowlers`, index, issues);

  const events = Array.isArray(innings.events) ? innings.events : [];
  events.forEach((event, eventIndex) => migrateEventIdentity(
    event,
    battingTeam,
    bowlingTeam,
    `${sourcePath}.events.${eventIndex}`,
    index,
    issues,
  ));
  const initialFreeHitPending = innings.historyBase?.freeHitPending ??
    (events.length === 0 ? innings.freeHitPending : false);
  innings.freeHitPending = backfillFreeHitMarkers(events, initialFreeHitPending);

  if (innings.historyBase && typeof innings.historyBase === "object") {
    migrateInnings(innings.historyBase, `${sourcePath}.historyBase`, index, issues);
  }
  if (Array.isArray(innings.redoStack)) {
    innings.redoStack.forEach((event, eventIndex) => migrateEventIdentity(
      event,
      battingTeam,
      bowlingTeam,
      `${sourcePath}.redoStack.${eventIndex}`,
      index,
      issues,
    ));
  }

  if (Array.isArray(innings.commentary)) {
    innings.commentary.forEach((entry, entryIndex) => {
      for (const descriptor of [
        ["batterId", "batterNameSnapshot", "batterName", battingTeam, "batter"],
        ["bowlerId", "bowlerNameSnapshot", "bowlerName", bowlingTeam, "bowler"],
        ["outPlayerId", "outPlayerNameSnapshot", "outPlayerName", battingTeam, "outPlayer"],
        ["fielderId", "fielderNameSnapshot", "fielderName", bowlingTeam, "fielder"],
      ]) {
        const [idField, snapshotField, legacyNameField, team, label] = descriptor;
        assignIdentity(entry, {
          idField,
          snapshotField,
          legacyNameField,
          team,
          sourcePath: `${sourcePath}.commentary.${entryIndex}.${label}`,
        }, index, issues);
      }
    });
  }
  if (Array.isArray(innings.fallOfWickets)) {
    innings.fallOfWickets.forEach((entry, entryIndex) => assignIdentity(entry, {
      idField: "playerId",
      snapshotField: "nameSnapshot",
      legacyNameField: "player",
      team: battingTeam,
      sourcePath: `${sourcePath}.fallOfWickets.${entryIndex}`,
    }, index, issues));
  }
  if (Array.isArray(innings.milestones)) {
    innings.milestones.forEach((entry, entryIndex) => assignIdentity(entry, {
      idField: "playerId",
      snapshotField: "nameSnapshot",
      legacyNameField: "player",
      team: "",
      sourcePath: `${sourcePath}.milestones.${entryIndex}`,
    }, index, issues));
  }
  if (Array.isArray(innings.overHistory)) {
    innings.overHistory.forEach((entry, entryIndex) => assignIdentity(entry, {
      idField: "bowlerId",
      snapshotField: "bowlerNameSnapshot",
      legacyNameField: "bowlerName",
      team: bowlingTeam,
      sourcePath: `${sourcePath}.overHistory.${entryIndex}`,
    }, index, issues));
  }

  const currentBowler = (innings.bowlers || []).find((bowler) =>
    clean(bowler.nameSnapshot || bowler.name) === clean(innings.currentBowler));
  if (currentBowler?.playerId) innings.currentBowlerId = clean(currentBowler.playerId);
  const lastBowler = (innings.bowlers || []).find((bowler) =>
    clean(bowler.nameSnapshot || bowler.name) === clean(innings.lastOverBowler));
  if (lastBowler?.playerId) innings.lastOverBowlerId = clean(lastBowler.playerId);
}

function migrateStatistics(statistics, index, issues) {
  if (!statistics || typeof statistics !== "object") return;
  if (Array.isArray(statistics.players)) {
    statistics.players.forEach((player, playerIndex) => assignIdentity(player, {
      idField: "playerId",
      snapshotField: "nameSnapshot",
      legacyNameField: "name",
      team: player.team,
      sourcePath: `statistics.players.${playerIndex}`,
    }, index, issues));
  }
  for (const [key, award] of Object.entries(statistics)) {
    if (key === "players" || !award || typeof award !== "object" || Array.isArray(award)) continue;
    assignIdentity(award, {
      idField: "playerId",
      snapshotField: "nameSnapshot",
      legacyNameField: "name",
      team: award.team,
      sourcePath: `statistics.${key}`,
    }, index, issues);
  }
}

function migrateMatchIdentity(match, index) {
  const issues = [];
  migrateMatchParticipants(match, index, issues);
  for (const key of INNINGS_KEYS) migrateInnings(match[key], key, index, issues);
  migrateStatistics(match.statistics, index, issues);
  if (Array.isArray(match.redoStack)) {
    match.redoStack.forEach((batch, batchIndex) => {
      const key = batch?.key;
      const innings = key && match[key];
      migrateEventIdentity(
        batch?.event,
        innings?.battingTeam,
        innings?.bowlingTeam,
        `redoStack.${batchIndex}.event`,
        index,
        issues,
      );
    });
  }

  if (issues.length === 0) match.schemaVersion = 3;
  return { match, issues, complete: issues.length === 0 };
}

async function main() {
  require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
  require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env"), override: false });
  const mongoose = require("mongoose");
  const connectDB = require("../config/db");
  const Match = require("../models/Match");
  const Player = require("../models/Player");
  const apply = process.argv.includes("--apply");
  const matchArgIndex = process.argv.indexOf("--match");
  const matchId = matchArgIndex >= 0 ? process.argv[matchArgIndex + 1] : null;
  if (matchId && !mongoose.Types.ObjectId.isValid(matchId)) throw new Error("--match must be a valid MongoDB ObjectId");

  await connectDB();
  const players = await Player.find({}).select("name fullName team role photo").lean();
  const index = buildPlayerIndex(players);
  const query = matchId ? { _id: new mongoose.Types.ObjectId(matchId) } : {};
  const cursor = Match.collection.find(query);
  const summary = { scanned: 0, complete: 0, partial: 0, applied: 0, unresolved: 0, errors: 0 };
  for await (const match of cursor) {
    summary.scanned += 1;
    try {
      const result = migrateMatchIdentity(match, index);
      summary[result.complete ? "complete" : "partial"] += 1;
      summary.unresolved += result.issues.length;
      console.log(`${apply ? "APPLY" : "DRY-RUN"} match=${match._id} status=${result.complete ? "complete" : "needs-confirmation"} issues=${result.issues.length}`);
      for (const issue of result.issues) console.log(JSON.stringify(issue));
      if (apply) {
        const $set = {};
        if (result.complete) $set.schemaVersion = 3;
        for (const field of ["teamAParticipants", "teamBParticipants", "teamAPlayingXI", "teamBPlayingXI"]) {
          if (match[field] != null) $set[field] = match[field];
        }
        for (const key of INNINGS_KEYS) if (match[key]) $set[key] = match[key];
        if (match.statistics) $set.statistics = match.statistics;
        if (match.redoStack) $set.redoStack = match.redoStack;
        await Match.collection.updateOne({ _id: match._id }, { $set });
        summary.applied += 1;
      }
    } catch (error) {
      summary.errors += 1;
      console.error(`SKIP match=${match._id} reason=${error.message}`);
    }
  }
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", ...summary }));
  if (summary.errors > 0 || (apply && summary.partial > 0)) process.exitCode = 2;
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Identity migration failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  backfillFreeHitMarkers,
  buildPlayerIndex,
  migrateEventIdentity,
  migrateInnings,
  migrateMatchParticipants,
  migrateMatchIdentity,
  migrateReferenceList,
  resolveLegacyIdentity,
};
