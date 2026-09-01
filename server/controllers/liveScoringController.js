"use strict";

const Match = require("../models/Match");
const mongoose = require("mongoose");
const Player = require("../models/Player");
const { createHash } = require("crypto");
const { serializeMatch } = require("../services/matchSerializer");
const {
  BALL,
  ADD_BATTER,
  ADD_BOWLER,
  END_INNINGS,
  COMMENTARY,
  ScoringError,
  activeBatters,
  canonicalizeBallEvent,
  cleanName,
  clone,
  createControlEvent,
  deriveMatchState,
  emptyInningsState,
  hasMeaningfulLegacyState,
  rebuildInnings,
  snapshotInningsState,
  validateBallAgainstState,
} = require("../services/scoringEngine");

const MAX_EVENTS_PER_INNINGS = 2000;
const MAX_PROCESSED_ACTIONS = 5000;
const ACTION_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

let io;
exports.setSocket = (socketServer) => { io = socketServer; };

const emitMatch = (match) => {
  if (io && match?._id) io.to(String(match._id)).emit("scoreUpdate", serializeMatch(match));
};

const httpError = (status, message, code) => {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
};

const asyncHandler = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    const status = error.status || (error instanceof ScoringError ? error.status : 500);
    const message = status >= 500 ? "Unable to update the match" : error.message;
    if (status >= 500) console.error("Live scoring mutation failed:", error.message);
    res.status(status).json({ success: false, message, code: error.code || "SCORING_ERROR" });
  }
};

const actionIdFrom = (req) => cleanName(req.get("Idempotency-Key") || req.body?.actionId);

const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((output, key) => {
    output[key] = stableValue(value[key]);
    return output;
  }, {});
};

const requestFingerprint = (req, operation) => {
  const payload = { ...(req.body || {}) };
  delete payload.actionId;
  delete payload.expectedVersion;
  const params = { ...(req.params || {}) };
  delete params.id;
  return createHash("sha256")
    .update(JSON.stringify(stableValue({ operation, params, payload })))
    .digest("hex");
};

const actionContext = (req, operation) => {
  const actionId = actionIdFrom(req);
  if (!ACTION_ID_PATTERN.test(actionId)) {
    throw httpError(400, "A valid actionId (8-128 URL-safe characters) is required", "ACTION_ID_REQUIRED");
  }
  const rawVersion = req.get("If-Match-Version") ?? req.body?.expectedVersion;
  const expectedVersion = Number(rawVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
    throw httpError(428, "expectedVersion is required for match mutations", "VERSION_REQUIRED");
  }
  return { actionId, expectedVersion, operation, fingerprint: requestFingerprint(req, operation) };
};

const receiptFor = (match, actionId) => (match.processedActions || []).find((item) => item.actionId === actionId);

const loadForMutation = async (req, operation) => {
  const context = actionContext(req, operation);
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    throw httpError(400, "Invalid match ID", "INVALID_MATCH_ID");
  }
  const match = await Match.findById(req.params.id);
  if (!match) throw httpError(404, "Match not found", "MATCH_NOT_FOUND");

  const receipt = receiptFor(match, context.actionId);
  if (receipt) {
    if (receipt.operation !== operation) {
      throw httpError(409, "actionId was already used for a different operation", "ACTION_ID_REUSED");
    }
    if (receipt.fingerprint && receipt.fingerprint !== context.fingerprint) {
      throw httpError(409, "actionId was reused with a different payload", "ACTION_ID_PAYLOAD_MISMATCH");
    }
    return { match, context, duplicate: true };
  }
  if (match.__v !== context.expectedVersion) {
    throw httpError(409, "Match state changed. Refresh before applying this action.", "STALE_MATCH_VERSION");
  }
  return { match, context, duplicate: false };
};

const recordReceipt = (match, context) => {
  match.processedActions ||= [];
  if (match.processedActions.length >= MAX_PROCESSED_ACTIONS) {
    throw new ScoringError("Action receipt limit reached; archive this match before further mutations", 422, "ACTION_HISTORY_LIMIT_REACHED");
  }
  match.processedActions.push({
    actionId: context.actionId,
    operation: context.operation,
    fingerprint: context.fingerprint,
    eventSequence: match.eventSequence || 0,
    processedAt: new Date(),
  });
};

const saveMutation = async (match, context) => {
  recordReceipt(match, context);
  try {
    return { match: await match.save(), duplicate: false };
  } catch (error) {
    if (error?.name !== "VersionError") throw error;
    const latest = await Match.findById(match._id);
    const receipt = latest && receiptFor(latest, context.actionId);
    if (receipt?.operation === context.operation) {
      if (receipt.fingerprint && receipt.fingerprint !== context.fingerprint) {
        throw httpError(409, "actionId was reused with a different payload", "ACTION_ID_PAYLOAD_MISMATCH");
      }
      return { match: latest, duplicate: true };
    }
    throw httpError(409, "Another scoring action won the update race. Refresh and retry intentionally.", "SCORING_CONFLICT");
  }
};

const respondWithMatch = (res, match, extra = {}) => res.json({ success: true, match: serializeMatch(match), ...extra });

const teamOpposite = (match, team) => team === match.teamA ? match.teamB : match.teamA;

const matchLimits = (match, superOver = false) => ({
  maxWickets: superOver ? 2 : 10,
  maxBalls: superOver ? 6 : match.format === "Test" ? null : Math.max(1, Number(match.overs || 20)) * 6,
});

const freshInnings = (battingTeam, bowlingTeam) => ({
  ...emptyInningsState(battingTeam, bowlingTeam),
  events: [],
  historyBase: null,
  historyBoundaryReason: "",
  eventHistoryInitialized: true,
  redoStack: [],
  rulesVersion: 1,
});

const plainInnings = (innings) => innings && typeof innings.toObject === "function"
  ? innings.toObject({ depopulate: true })
  : clone(innings);

const prepareHistory = (innings, { legacyClosed = false } = {}) => {
  const raw = plainInnings(innings) || {};
  raw.events = Array.isArray(raw.events) ? raw.events : [];
  raw.redoStack = Array.isArray(raw.redoStack) ? raw.redoStack : [];
  const wasEventBacked = raw.eventHistoryInitialized === true || raw.events.length > 0;
  if (!wasEventBacked && !raw.historyBase && raw.events.length === 0 &&
      (hasMeaningfulLegacyState(raw) || legacyClosed)) {
    raw.historyBase = snapshotInningsState(raw);
    raw.historyBoundaryReason = "legacy-score-import";
  }
  raw.eventHistoryInitialized = true;
  if (legacyClosed && raw.historyBase && raw.historyBoundaryReason === "legacy-score-import") {
    raw.historyBase.isDone = true;
    raw.historyBase.endReason ||= "legacyClosed";
  }
  return raw;
};

const legacyInningsWasClosed = (match, key) => {
  if (key === "innings1") return Number(match.currentInnings) === 2 || Boolean(match.innings2) || match.status === "completed";
  if (key === "innings2") return match.status === "completed" && !match.isSuperOver;
  if (key === "superOverInnings1") return match.isSuperOver && (Number(match.currentInnings) === 2 || Boolean(match.superOverInnings2));
  if (key === "superOverInnings2") return match.isSuperOver && match.status === "completed";
  return false;
};

const projectInnings = (match, key, options = {}) => {
  if (!match[key]) return null;
  const current = prepareHistory(match[key], { legacyClosed: legacyInningsWasClosed(match, key) });
  const events = Array.isArray(current.events) ? current.events : [];
  const baseline = current.historyBase || null;
  const projection = rebuildInnings({
    battingTeam: current.battingTeam,
    bowlingTeam: current.bowlingTeam || teamOpposite(match, current.battingTeam),
    baseline,
    events,
    ...options,
  });
  match[key] = {
    ...projection,
    events,
    historyBase: current.historyBase || null,
    historyBoundaryReason: current.historyBoundaryReason || "",
    eventHistoryInitialized: true,
    redoStack: Array.isArray(current.redoStack) ? current.redoStack : [],
    rulesVersion: current.rulesVersion || 1,
  };
  match.markModified(key);
  return match[key];
};

const ensureSecondInnings = (match, superOver = false) => {
  const firstKey = superOver ? "superOverInnings1" : "innings1";
  const secondKey = superOver ? "superOverInnings2" : "innings2";
  if (match[secondKey]) return match[secondKey];
  const firstTeam = match[firstKey]?.battingTeam;
  match[secondKey] = freshInnings(teamOpposite(match, firstTeam), firstTeam);
  match.markModified(secondKey);
  return match[secondKey];
};

const synchronizeRegulationMatch = (match) => {
  const limits = matchLimits(match, false);
  const first = projectInnings(match, "innings1", limits);
  if (!first) return deriveMatchState(match, limits);
  if (first.isDone) ensureSecondInnings(match, false);
  if (match.innings2) projectInnings(match, "innings2", { ...limits, target: first.runs + 1 });
  deriveMatchState(match, limits);
  if (!first.isDone && match.innings2) {
    const secondRaw = plainInnings(match.innings2);
    const hasSecondHistory = Boolean(secondRaw.historyBase) || (secondRaw.events || []).length > 0;
    if (!hasSecondHistory) match.innings2 = undefined;
  }
};

const synchronizeSuperOver = (match) => {
  const limits = matchLimits(match, true);
  const first = projectInnings(match, "superOverInnings1", limits);
  if (!first) throw new ScoringError("Super over is not initialized", 422, "SUPER_OVER_NOT_INITIALIZED");
  if (first.isDone) ensureSecondInnings(match, true);
  const second = match.superOverInnings2
    ? projectInnings(match, "superOverInnings2", { ...limits, target: first.runs + 1 })
    : null;

  match.currentInnings = first.isDone ? 2 : 1;
  match.target = first.isDone ? first.runs + 1 : 0;
  const current = match.currentInnings === 2 ? second : first;
  match.requiredRuns = second ? Math.max(0, match.target - second.runs) : 0;
  const ballsRemaining = second ? Math.max(0, 6 - second.balls) : 0;
  match.requiredRunRate = ballsRemaining > 0 && match.requiredRuns > 0
    ? Number((match.requiredRuns / (ballsRemaining / 6)).toFixed(2))
    : 0;
  match.recentBalls = current?.recentBalls?.slice(-12) || [];
  match.currentBatsmen = current ? activeBatters(current).map((batter) => batter.name) : [];
  match.currentBowler = current?.currentBowler || "";
  if (second && second.isDone) {
    match.status = "completed";
    match.phase = "finished";
    if (second.runs >= first.runs + 1) match.result = `${second.battingTeam} won the Super Over`;
    else if (first.runs > second.runs) match.result = `${first.battingTeam} won the Super Over`;
    else match.result = "Super Over tied";
  } else {
    match.status = "live";
    match.phase = first.isDone
      ? (second && (second.balls > 0 || second.runs > 0) ? "secondInnings" : "inningsBreak")
      : "firstInnings";
    match.result = "";
  }
};

const synchronizeMatch = (match) => {
  if (match.isSuperOver) synchronizeSuperOver(match);
  else synchronizeRegulationMatch(match);
  match.schemaVersion = 2;
};

const contextKey = (match, inningsNumber = match.currentInnings || 1) => match.isSuperOver
  ? (inningsNumber === 1 ? "superOverInnings1" : "superOverInnings2")
  : (inningsNumber === 1 ? "innings1" : "innings2");

const ensureCurrentInnings = (match, requestedNumber) => {
  const inningsNumber = Number(requestedNumber);
  if (![1, 2].includes(inningsNumber)) throw httpError(400, "inningsNum must be 1 or 2", "INVALID_INNINGS");
  if (inningsNumber !== match.currentInnings) {
    throw httpError(409, "The requested innings is no longer current", "STALE_INNINGS");
  }
  const key = contextKey(match, inningsNumber);
  if (!match[key]) throw new ScoringError("Current innings is not initialized", 422, "INNINGS_NOT_INITIALIZED");
  return { inningsNumber, key };
};

const ensureMatchIsLive = (match) => {
  if (match.status !== "live") {
    throw httpError(409, "Match must be live before changing innings state", "MATCH_NOT_LIVE");
  }
};

const nextSequence = (match) => {
  match.eventSequence = Math.max(0, Number(match.eventSequence || 0)) + 1;
  return match.eventSequence;
};

const appendEvent = (match, key, event, { clearRedo = true } = {}) => {
  const raw = prepareHistory(match[key]);
  if (raw.events.length >= MAX_EVENTS_PER_INNINGS) {
    throw new ScoringError("Innings event limit reached; archive the match before continuing", 422, "EVENT_LIMIT_REACHED");
  }
  if (raw.events.some((existing) => existing.actionId === event.actionId)) {
    throw httpError(409, "actionId already exists in this innings", "ACTION_ID_REUSED");
  }
  raw.events.push(event);
  raw.historyBase = raw.historyBase || null;
  if (clearRedo) match.redoStack = [];
  match[key] = raw;
  match.markModified(key);
  match.markModified("redoStack");
};

const validateSquadPlayer = (match, team, name, role) => {
  const squad = team === match.teamA ? match.squadA : match.squadB;
  if (Array.isArray(squad) && squad.length > 0 && !squad.includes(name)) {
    throw new ScoringError(`${name} is not in ${team}'s selected squad`, 422, `INVALID_${role.toUpperCase()}`);
  }
};

const validatePlayerId = async (playerId, name, role) => {
  if (!playerId) return;
  if (!mongoose.Types.ObjectId.isValid(playerId)) {
    throw httpError(400, `Invalid ${role} player ID`, "INVALID_PLAYER_ID");
  }
  const player = await Player.findById(playerId).select("name").lean();
  if (!player || cleanName(player.name) !== cleanName(name)) {
    throw new ScoringError(`${role} player ID does not match the selected player`, 422, "PLAYER_ID_MISMATCH");
  }
};

const logMutation = (operation, match, key, event, before, after) => {
  console.info([
    `MATCH ${match._id}`,
    `INNINGS ${key}`,
    `SEQ ${event?.sequence || match.eventSequence || 0}`,
    `ACTION ${operation}`,
    event?.batterName ? `BATSMAN ${event.batterName}` : "",
    event?.bowlerName ? `BOWLER ${event.bowlerName}` : "",
    before ? `BEFORE ${before.runs}/${before.wickets}` : "",
    after ? `AFTER ${after.runs}/${after.wickets}` : "",
  ].filter(Boolean).join(" | "));
};

let derivedRebuildQueue = Promise.resolve();
const scheduleDerivedRebuilds = (match, { refreshAggregates = false } = {}) => {
  if (!refreshAggregates) return;
  const tournamentId = match.tournament ? String(match.tournament) : null;
  derivedRebuildQueue = derivedRebuildQueue.then(async () => {
    if (tournamentId) {
      try {
        const legacy = require("./matchController");
        if (typeof legacy.rebuildPointsTable === "function") {
          await legacy.rebuildPointsTable(tournamentId);
        }
      } catch (error) {
        console.error("Post-score points-table rebuild failed:", error.message);
      }
    }
    try {
      const { rebuildAllPlayerStats } = require("./playerController");
      await rebuildAllPlayerStats();
    } catch (error) {
      console.error("Post-score player-statistics rebuild failed:", error.message);
    }
  });
};

const refreshCompletionStatistics = (match) => {
  if (match.status !== "completed") return;
  const legacy = require("./matchController");
  if (typeof legacy.computeMatchStatistics === "function") legacy.computeMatchStatistics(match);
};

exports.setToss = asyncHandler(async (req, res) => {
  const loaded = await loadForMutation(req, "START_MATCH");
  if (loaded.duplicate) return respondWithMatch(res, loaded.match, { duplicate: true });
  const { match, context } = loaded;
  const winner = cleanName(req.body.winner);
  const decision = cleanName(req.body.decision);
  if (![match.teamA, match.teamB].includes(winner)) throw httpError(400, "Toss winner must be one of the match teams", "INVALID_TOSS_WINNER");
  if (!["bat", "bowl"].includes(decision)) throw httpError(400, "Toss decision must be bat or bowl", "INVALID_TOSS_DECISION");

  if (match.innings1 || match.status !== "upcoming") {
    if (match.tossWinner === winner && match.tossDecision === decision) {
      return respondWithMatch(res, match, { idempotent: true });
    }
    throw httpError(409, "Match has already started; toss cannot reset live innings", "MATCH_ALREADY_STARTED");
  }

  const battingFirst = decision === "bat" ? winner : teamOpposite(match, winner);
  match.tossWinner = winner;
  match.tossDecision = decision;
  match.innings1 = freshInnings(battingFirst, teamOpposite(match, battingFirst));
  match.innings2 = undefined;
  match.superOverInnings1 = undefined;
  match.superOverInnings2 = undefined;
  match.isSuperOver = false;
  match.currentInnings = 1;
  match.status = "live";
  match.phase = "firstInnings";
  match.result = "";
  match.target = 0;
  match.requiredRuns = 0;
  match.requiredRunRate = 0;
  match.target = 0;
  match.requiredRuns = 0;
  match.requiredRunRate = 0;
  match.recentBalls = [];
  match.currentBatsmen = [];
  match.currentBowler = "";
  match.redoStack = [];
  nextSequence(match);
  const saved = await saveMutation(match, context);
  if (!saved.duplicate) emitMatch(saved.match);
  respondWithMatch(res, saved.match, { duplicate: saved.duplicate });
});

exports.updateScore = asyncHandler(async (req, res) => {
  const loaded = await loadForMutation(req, "SCORE_BALL");
  if (loaded.duplicate) return respondWithMatch(res, loaded.match, { duplicate: true });
  const { match, context } = loaded;
  ensureMatchIsLive(match);
  const { inningsNumber, key } = ensureCurrentInnings(match, req.body.inningsNum);
  const raw = prepareHistory(match[key]);
  const limits = matchLimits(match, match.isSuperOver);
  const target = inningsNumber === 2
    ? ((match.isSuperOver ? match.superOverInnings1 : match.innings1)?.runs || 0) + 1
    : null;
  const before = rebuildInnings({
    battingTeam: raw.battingTeam,
    bowlingTeam: raw.bowlingTeam,
    baseline: raw.historyBase || null,
    events: raw.events,
    ...limits,
    target,
  });
  const nonStriker = activeBatters(before).find((batter) => batter.name !== cleanName(req.body.batterName));
  const event = canonicalizeBallEvent({
    ...req.body,
    actionId: context.actionId,
    sequence: nextSequence(match),
    inningsNumber,
    nonStrikerName: req.body.nonStrikerName || nonStriker?.name,
  });
  const bowlingTeam = before.bowlingTeam || teamOpposite(match, before.battingTeam);
  if (event.batterName) {
    validateSquadPlayer(match, before.battingTeam, event.batterName, "batter");
  }
  if (event.bowlerName) {
    validateSquadPlayer(match, bowlingTeam, event.bowlerName, "bowler");
  }
  if (event.isWicket && event.outPlayerName && event.outPlayerName !== event.batterName) {
    validateSquadPlayer(match, before.battingTeam, event.outPlayerName, "batter");
  }
  if (event.fielderName) validateSquadPlayer(match, bowlingTeam, event.fielderName, "fielder");
  await Promise.all([
    validatePlayerId(event.batterId, event.batterName, "Batter"),
    validatePlayerId(event.nonStrikerId, event.nonStrikerName, "Non-striker"),
    validatePlayerId(event.bowlerId, event.bowlerName, "Bowler"),
    validatePlayerId(event.outPlayerId, event.outPlayerName, "Dismissed batter"),
    validatePlayerId(event.fielderId, event.fielderName, "Fielder"),
  ]);
  validateBallAgainstState(before, event);
  appendEvent(match, key, event);
  synchronizeMatch(match);
  const after = match[key];
  const refreshAggregates = match.status === "completed";
  const isOverComplete = event.legalDelivery && after.balls > before.balls && after.balls % 6 === 0;
  if (match.status !== "completed") match.statistics = {};
  else refreshCompletionStatistics(match);
  const saved = await saveMutation(match, context);
  if (!saved.duplicate) {
    emitMatch(saved.match);
    logMutation("BALL", saved.match, key, event, before, saved.match[key]);
    scheduleDerivedRebuilds(saved.match, { refreshAggregates });
  }
  respondWithMatch(res, saved.match, { duplicate: saved.duplicate, isOverComplete, eventSequence: event.sequence });
});

exports.addBatsman = asyncHandler(async (req, res) => {
  const loaded = await loadForMutation(req, "ADD_BATTER");
  if (loaded.duplicate) return respondWithMatch(res, loaded.match, { duplicate: true });
  const { match, context } = loaded;
  ensureMatchIsLive(match);
  const { inningsNumber, key } = ensureCurrentInnings(match, Number(req.params.num));
  const name = cleanName(req.body.name);
  if (!name) throw httpError(400, "Batter name is required", "BATTER_REQUIRED");
  const raw = prepareHistory(match[key]);
  const limits = matchLimits(match, match.isSuperOver);
  const current = rebuildInnings({
    battingTeam: raw.battingTeam,
    bowlingTeam: raw.bowlingTeam,
    baseline: raw.historyBase || null,
    events: raw.events,
    ...limits,
    target: inningsNumber === 2 ? match.target : null,
  });
  validateSquadPlayer(match, current.battingTeam, name, "batter");
  await validatePlayerId(cleanName(req.body.playerId), name, "Batter");
  if (current.bowlers.some((bowler) => bowler.name === name)) {
    throw new ScoringError("A selected bowler cannot bat for the opposing side", 422, "INVALID_BATTER_TEAM");
  }
  if (current.batsmen.some((batter) => batter.name === name && batter.isOut)) {
    throw new ScoringError("A dismissed batter cannot return", 422, "BATTER_ALREADY_DISMISSED");
  }
  if (activeBatters(current).some((batter) => batter.name === name)) {
    return respondWithMatch(res, match, { idempotent: true });
  }
  if (activeBatters(current).length >= 2) throw new ScoringError("Two batters are already active", 422, "ACTIVE_BATTERS_FULL");
  const active = activeBatters(current);
  const isStriker = active.length === 0 || !active.some((batter) => batter.isStriker);
  const event = createControlEvent(ADD_BATTER, {
    actionId: context.actionId,
    sequence: nextSequence(match),
    inningsNumber,
    name,
    isStriker,
  });
  event.playerId = cleanName(req.body.playerId);
  appendEvent(match, key, event);
  synchronizeMatch(match);
  refreshCompletionStatistics(match);
  const saved = await saveMutation(match, context);
  if (!saved.duplicate) emitMatch(saved.match);
  respondWithMatch(res, saved.match, { duplicate: saved.duplicate });
});

exports.addBowler = asyncHandler(async (req, res) => {
  const loaded = await loadForMutation(req, "ADD_BOWLER");
  if (loaded.duplicate) return respondWithMatch(res, loaded.match, { duplicate: true });
  const { match, context } = loaded;
  ensureMatchIsLive(match);
  const { inningsNumber, key } = ensureCurrentInnings(match, Number(req.params.num));
  const name = cleanName(req.body.name);
  if (!name) throw httpError(400, "Bowler name is required", "BOWLER_REQUIRED");
  const raw = prepareHistory(match[key]);
  const battingTeam = raw.battingTeam;
  const bowlingTeam = raw.bowlingTeam || teamOpposite(match, battingTeam);
  const limits = matchLimits(match, match.isSuperOver);
  const current = rebuildInnings({
    battingTeam,
    bowlingTeam,
    baseline: raw.historyBase || null,
    events: raw.events,
    ...limits,
    target: inningsNumber === 2 ? match.target : null,
  });
  validateSquadPlayer(match, bowlingTeam, name, "bowler");
  await validatePlayerId(cleanName(req.body.playerId), name, "Bowler");
  const battingSquad = battingTeam === match.teamA ? match.squadA : match.squadB;
  if (Array.isArray(battingSquad) && battingSquad.includes(name)) {
    throw new ScoringError("A member of the batting team cannot be selected as bowler", 422, "INVALID_BOWLER_TEAM");
  }
  if (current.batsmen.some((batter) => batter.name === name)) {
    throw new ScoringError("A batter in this innings cannot be selected as bowler", 422, "INVALID_BOWLER_TEAM");
  }
  if (current.balls > 0 && current.balls % 6 === 0 && current.lastOverBowler === name) {
    throw new ScoringError("A bowler cannot bowl consecutive overs", 422, "CONSECUTIVE_OVERS");
  }
  if (current.currentOverStarted && current.currentBowler && current.currentBowler !== name) {
    throw new ScoringError("The bowler cannot be changed during an over", 422, "BOWLER_CHANGE_MID_OVER");
  }
  if (current.currentBowler === name) {
    return respondWithMatch(res, match, { idempotent: true });
  }
  const event = createControlEvent(ADD_BOWLER, {
    actionId: context.actionId,
    sequence: nextSequence(match),
    inningsNumber,
    name,
  });
  event.playerId = cleanName(req.body.playerId);
  appendEvent(match, key, event);
  synchronizeMatch(match);
  refreshCompletionStatistics(match);
  const saved = await saveMutation(match, context);
  if (!saved.duplicate) emitMatch(saved.match);
  respondWithMatch(res, saved.match, { duplicate: saved.duplicate });
});

exports.addCommentary = asyncHandler(async (req, res) => {
  const loaded = await loadForMutation(req, "ADD_COMMENTARY");
  if (loaded.duplicate) return respondWithMatch(res, loaded.match, { duplicate: true });
  const { match, context } = loaded;
  ensureMatchIsLive(match);
  const { inningsNumber, key } = ensureCurrentInnings(match, req.body.inningsNum);
  const text = cleanName(req.body.text);
  if (!text) throw httpError(400, "Commentary text is required", "COMMENTARY_REQUIRED");
  const event = createControlEvent(COMMENTARY, {
    actionId: context.actionId,
    sequence: nextSequence(match),
    inningsNumber,
    text,
    over: req.body.over,
  });
  appendEvent(match, key, event);
  synchronizeMatch(match);
  refreshCompletionStatistics(match);
  const saved = await saveMutation(match, context);
  if (!saved.duplicate) emitMatch(saved.match);
  respondWithMatch(res, saved.match, { duplicate: saved.duplicate });
});

const locateUndoTarget = (match) => {
  const currentKey = contextKey(match, match.currentInnings || 1);
  const current = plainInnings(match[currentKey]);
  if (current?.events?.length) return { key: currentKey, raw: current };
  if ((match.currentInnings || 1) === 2) {
    const firstKey = contextKey(match, 1);
    const first = plainInnings(match[firstKey]);
    if (first?.events?.length) return { key: firstKey, raw: first };
  }
  return null;
};

exports.undoLastAction = asyncHandler(async (req, res) => {
  const loaded = await loadForMutation(req, "UNDO");
  if (loaded.duplicate) return respondWithMatch(res, loaded.match, { duplicate: true });
  const { match, context } = loaded;
  const wasCompleted = match.status === "completed";
  const target = locateUndoTarget(match);
  if (!target) {
    const hasLegacyBoundary = ["innings1", "innings2", "superOverInnings1", "superOverInnings2"]
      .some((key) => match[key]?.historyBase);
    throw httpError(409, hasLegacyBoundary
      ? "Undo reached the safe legacy-history boundary"
      : "Nothing to undo", hasLegacyBoundary ? "UNDO_HISTORY_BOUNDARY" : "NOTHING_TO_UNDO");
  }
  const removed = target.raw.events.pop();
  match.redoStack ||= [];
  match.redoStack.push({ key: target.key, event: clone(removed) });
  match[target.key] = target.raw;
  match.markModified(target.key);
  match.markModified("redoStack");
  synchronizeMatch(match);
  if (match.status !== "completed") match.statistics = {};
  else refreshCompletionStatistics(match);
  const saved = await saveMutation(match, context);
  if (!saved.duplicate) {
    emitMatch(saved.match);
    logMutation("UNDO", saved.match, target.key, removed, null, saved.match[target.key]);
    scheduleDerivedRebuilds(saved.match, { refreshAggregates: wasCompleted || saved.match.status === "completed" });
  }
  respondWithMatch(res, saved.match, { duplicate: saved.duplicate, undoneType: removed.type, undoneSequence: removed.sequence });
});

exports.redoLastAction = asyncHandler(async (req, res) => {
  const loaded = await loadForMutation(req, "REDO");
  if (loaded.duplicate) return respondWithMatch(res, loaded.match, { duplicate: true });
  const { match, context } = loaded;
  const wasCompleted = match.status === "completed";
  const redoStack = Array.isArray(match.redoStack) ? match.redoStack : [];
  if (redoStack.length === 0) throw httpError(409, "Nothing to redo", "NOTHING_TO_REDO");
  const batch = redoStack.pop();
  if (!batch?.key || !batch.event) throw new ScoringError("Redo history is malformed", 422, "INVALID_REDO_HISTORY");
  if (!match[batch.key]) {
    const firstKey = batch.key.includes("superOver") ? "superOverInnings1" : "innings1";
    const firstTeam = match[firstKey]?.battingTeam;
    match[batch.key] = freshInnings(teamOpposite(match, firstTeam), firstTeam);
  }
  const raw = prepareHistory(match[batch.key]);
  raw.events.push(batch.event);
  match[batch.key] = raw;
  match.redoStack = redoStack;
  match.markModified(batch.key);
  match.markModified("redoStack");
  synchronizeMatch(match);
  refreshCompletionStatistics(match);
  const saved = await saveMutation(match, context);
  if (!saved.duplicate) {
    emitMatch(saved.match);
    logMutation("REDO", saved.match, batch.key, batch.event, null, saved.match[batch.key]);
    scheduleDerivedRebuilds(saved.match, { refreshAggregates: wasCompleted || saved.match.status === "completed" });
  }
  respondWithMatch(res, saved.match, { duplicate: saved.duplicate, redoneType: batch.event.type, redoneSequence: batch.event.sequence });
});

exports.declareInnings = asyncHandler(async (req, res) => {
  const loaded = await loadForMutation(req, "END_INNINGS");
  if (loaded.duplicate) return respondWithMatch(res, loaded.match, { duplicate: true });
  const { match, context } = loaded;
  ensureMatchIsLive(match);
  const { inningsNumber, key } = ensureCurrentInnings(match, req.body.inningsNum);
  const raw = prepareHistory(match[key]);
  const event = createControlEvent(END_INNINGS, {
    actionId: context.actionId,
    sequence: nextSequence(match),
    inningsNumber,
    reason: cleanName(req.body.reason) || "declared",
    commentary: cleanName(req.body.commentary),
  });
  appendEvent(match, key, event);
  synchronizeMatch(match);
  const refreshAggregates = match.status === "completed";
  refreshCompletionStatistics(match);
  const saved = await saveMutation(match, context);
  if (!saved.duplicate) {
    emitMatch(saved.match);
    logMutation("END_INNINGS", saved.match, key, event, null, saved.match[key]);
    scheduleDerivedRebuilds(saved.match, { refreshAggregates });
  }
  respondWithMatch(res, saved.match, { duplicate: saved.duplicate });
});

exports.setMatchStatus = asyncHandler(async (req, res) => {
  const loaded = await loadForMutation(req, "END_MATCH");
  if (loaded.duplicate) return respondWithMatch(res, loaded.match, { duplicate: true });
  const { match, context } = loaded;
  const status = cleanName(req.body.status);
  if (status !== "completed") throw httpError(400, "Live scoring status can only be finalized here", "INVALID_STATUS_TRANSITION");
  const requestedResult = cleanName(req.body.result).toLowerCase();
  const noResult = req.body.noResult === true || requestedResult.includes("no result") || requestedResult.includes("abandon");
  if (match.status === "completed") {
    const alreadyNoResult = match.phase === "noResult" || /^no result$/i.test(cleanName(match.result));
    if (alreadyNoResult !== noResult) {
      throw httpError(409, "The match already has a final result and cannot be finalized differently", "MATCH_ALREADY_FINALIZED");
    }
    return respondWithMatch(res, match, { idempotent: true });
  }
  if (noResult) {
    match.status = "completed";
    match.phase = "noResult";
    match.result = "No result";
  } else {
    synchronizeMatch(match);
    if (match.status !== "completed") {
      throw new ScoringError("The current innings must be completed before ending the match", 422, "MATCH_NOT_FINISHED");
    }
  }
  refreshCompletionStatistics(match);
  const saved = await saveMutation(match, context);
  if (!saved.duplicate) {
    emitMatch(saved.match);
    scheduleDerivedRebuilds(saved.match, { refreshAggregates: true });
  }
  respondWithMatch(res, saved.match, { duplicate: saved.duplicate });
});

exports.startSuperOver = asyncHandler(async (req, res) => {
  const loaded = await loadForMutation(req, "START_SUPER_OVER");
  if (loaded.duplicate) return respondWithMatch(res, loaded.match, { duplicate: true });
  const { match, context } = loaded;
  if (match.isSuperOver && match.superOverInnings1) return respondWithMatch(res, match, { idempotent: true });
  if (match.status !== "completed" || !/tie/i.test(match.result || "")) {
    throw new ScoringError("A super over can only start after a tied regulation match", 422, "SUPER_OVER_NOT_ALLOWED");
  }
  match.isSuperOver = true;
  match.currentInnings = 1;
  match.status = "live";
  match.phase = "firstInnings";
  match.result = "";
  const firstTeam = match.innings2?.battingTeam || match.teamB;
  match.superOverInnings1 = freshInnings(firstTeam, teamOpposite(match, firstTeam));
  match.superOverInnings2 = undefined;
  match.redoStack = [];
  synchronizeMatch(match);
  nextSequence(match);
  const saved = await saveMutation(match, context);
  if (!saved.duplicate) {
    emitMatch(saved.match);
    scheduleDerivedRebuilds(saved.match, { refreshAggregates: true });
  }
  respondWithMatch(res, saved.match, { duplicate: saved.duplicate });
});

exports.setManOfTheMatch = asyncHandler(async (req, res) => {
  const loaded = await loadForMutation(req, "SET_MAN_OF_MATCH");
  if (loaded.duplicate) return respondWithMatch(res, loaded.match, { duplicate: true });
  const { match, context } = loaded;
  const name = cleanName(req.body.name).slice(0, 120);
  const reason = (cleanName(req.body.reason) || "Selected by admin").slice(0, 300);
  if (name) {
    const participants = new Set([
      ...(match.squadA || []),
      ...(match.squadB || []),
      ...(match.innings1?.batsmen || []).map((player) => player.name),
      ...(match.innings1?.bowlers || []).map((player) => player.name),
      ...(match.innings2?.batsmen || []).map((player) => player.name),
      ...(match.innings2?.bowlers || []).map((player) => player.name),
    ].map(cleanName).filter(Boolean));
    if (!participants.has(name)) {
      throw new ScoringError("Man of the Match must be a match participant", 422, "INVALID_MAN_OF_MATCH");
    }
  }

  const statistics = clone(match.statistics) || {};
  statistics.manOfTheMatch = name
    ? { name, reason, selectedByAdmin: true, selectedAt: new Date() }
    : null;
  match.statistics = statistics;
  match.markModified("statistics");
  const saved = await saveMutation(match, context);
  if (!saved.duplicate) {
    emitMatch(saved.match);
    if (saved.match.tournament) {
      setImmediate(async () => {
        try {
          const legacy = require("./matchController");
          await legacy.rebuildPlayerLeaderboards?.(saved.match.tournament);
        } catch (error) {
          console.error("Leaderboard rebuild after award failed:", error.message);
        }
      });
    }
  }
  respondWithMatch(res, saved.match, { duplicate: saved.duplicate });
});

exports._test = {
  appendEvent,
  contextKey,
  freshInnings,
  prepareHistory,
  projectInnings,
  scheduleDerivedRebuilds,
  synchronizeMatch,
  waitForDerivedRebuilds: () => derivedRebuildQueue,
};
