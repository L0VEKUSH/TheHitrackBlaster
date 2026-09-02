"use strict";

const Match = require("../models/Match");
const mongoose = require("mongoose");
const Player = require("../models/Player");
const { Tournament } = require("../models/other");
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
const { getRulesForTournament, isFreeHitEnabled } = require("../utils/tournamentRules");
const {
  findParticipant,
  getMaxWicketsFromPlayingXI,
  getPlayingXIForTeam,
  isInPlayingXI,
  normalizeIdentityText,
  normalizeParticipant,
  sameParticipant,
  validatePlayerParticipation,
} = require("../utils/playerIdentity");

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
    res.status(status).json({
      success: false,
      message,
      code: error.code || "SCORING_ERROR",
      ...(error.details ? { details: error.details } : {}),
    });
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

const attachTournamentRules = async (match) => {
  if (!match?.tournament || match.tournament?.rulesConfig) return;
  const tournamentId = cleanName(match.tournament?._id || match.tournament);
  if (!mongoose.Types.ObjectId.isValid(tournamentId)) return;
  const tournament = await Tournament.findById(tournamentId).select("rulesConfig").lean();
  if (!tournament) return;
  match.$locals ||= {};
  match.$locals.tournamentRules = tournament;
};

const loadForMutation = async (req, operation) => {
  const context = actionContext(req, operation);
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    throw httpError(400, "Invalid match ID", "INVALID_MATCH_ID");
  }
  const match = await Match.findById(req.params.id);
  if (!match) throw httpError(404, "Match not found", "MATCH_NOT_FOUND");
  await attachTournamentRules(match);

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

const tournamentRuleSource = (match) => match?.tournament?.rulesConfig
  ? match.tournament
  : match?.$locals?.tournamentRules || null;

const matchLimits = (match, { superOver = false, battingTeam = "" } = {}) => {
  const tournament = tournamentRuleSource(match);
  const rules = getRulesForTournament(tournament);
  const roster = getPlayingXIForTeam(match, battingTeam);
  const rosterLimit = getMaxWicketsFromPlayingXI(roster, 10);

  if (superOver) {
    const configuredWickets = Math.max(1, Number(rules.superOver?.maxWickets ?? 2));
    const configuredOvers = Math.max(1, Number(rules.superOver?.overs ?? 1));
    return {
      maxWickets: Math.min(rosterLimit, configuredWickets),
      maxBalls: configuredOvers * 6,
      freeHitEnabled: isFreeHitEnabled(tournament),
    };
  }

  const configuredWickets = Number(rules.innings?.maxWickets);
  const maxWickets = roster
    ? Math.min(rosterLimit, Number.isFinite(configuredWickets) ? configuredWickets : rosterLimit)
    : (Number.isFinite(configuredWickets) ? configuredWickets : 10);
  const configuredOvers = Number(rules.innings?.overs);
  const matchOvers = Number(match.overs || configuredOvers || 20);
  const maxBalls = match.format === "Test" ? null : Math.max(1, matchOvers) * 6;
  return { maxWickets, maxBalls, freeHitEnabled: isFreeHitEnabled(tournament) };
};

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
  const firstTeam = match.innings1?.battingTeam || match.teamA;
  const firstLimits = matchLimits(match, { battingTeam: firstTeam });
  const first = projectInnings(match, "innings1", firstLimits);
  if (!first) return deriveMatchState(match, firstLimits);
  if (first.isDone) ensureSecondInnings(match, false);
  const secondLimits = match.innings2
    ? matchLimits(match, { battingTeam: match.innings2.battingTeam })
    : firstLimits;
  if (match.innings2) projectInnings(match, "innings2", { ...secondLimits, target: first.runs + 1 });
  deriveMatchState(match, match.innings2 ? secondLimits : firstLimits);
  if (!first.isDone && match.innings2) {
    const secondRaw = plainInnings(match.innings2);
    const hasSecondHistory = Boolean(secondRaw.historyBase) || (secondRaw.events || []).length > 0;
    if (!hasSecondHistory) match.innings2 = undefined;
  }
};

const synchronizeSuperOver = (match) => {
  const firstLimits = matchLimits(match, {
    superOver: true,
    battingTeam: match.superOverInnings1?.battingTeam || match.teamA,
  });
  const first = projectInnings(match, "superOverInnings1", firstLimits);
  if (!first) throw new ScoringError("Super over is not initialized", 422, "SUPER_OVER_NOT_INITIALIZED");
  if (first.isDone) ensureSecondInnings(match, true);
  const secondLimits = match.superOverInnings2
    ? matchLimits(match, { superOver: true, battingTeam: match.superOverInnings2.battingTeam })
    : firstLimits;
  const second = match.superOverInnings2
    ? projectInnings(match, "superOverInnings2", { ...secondLimits, target: first.runs + 1 })
    : null;

  match.currentInnings = first.isDone ? 2 : 1;
  match.target = first.isDone ? first.runs + 1 : 0;
  const current = match.currentInnings === 2 ? second : first;
  match.requiredRuns = second ? Math.max(0, match.target - second.runs) : 0;
  const ballsRemaining = second && Number.isFinite(secondLimits.maxBalls)
    ? Math.max(0, secondLimits.maxBalls - second.balls)
    : 0;
  match.requiredRunRate = ballsRemaining > 0 && match.requiredRuns > 0
    ? Number((match.requiredRuns / (ballsRemaining / 6)).toFixed(2))
    : 0;
  match.recentBalls = current?.recentBalls?.slice(-12) || [];
  match.currentBatsmen = current ? activeBatters(current).map((batter) => batter.name) : [];
  match.currentBatsmenIds = current ? activeBatters(current).map((batter) => batter.playerId || "") : [];
  match.currentBowler = current?.currentBowler || "";
  match.currentBowlerId = current?.currentBowlerId || "";
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
  match.schemaVersion = 3;
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

const validateTeamParticipation = (match, team, participant, role) => {
  const roster = getPlayingXIForTeam(match, team);
  const validation = validatePlayerParticipation(participant, roster, role);
  if (!validation.valid) {
    throw new ScoringError(validation.reason, 422, "PLAYER_NOT_IN_PLAYING_XI");
  }
};

const findPlayerById = async (playerId) => {
  const query = Player.findById(playerId);
  if (query && typeof query.select === "function") return query.select("name fullName team role photo").lean();
  return query;
};

const requireExistingPlayer = async (participant, role, { authoritativeName = false } = {}) => {
  const requested = normalizeParticipant(participant);
  const playerId = requested.playerId;
  if (!playerId) {
    throw new ScoringError(`${role} player ID is required`, 422, "PLAYER_ID_REQUIRED");
  }
  if (!mongoose.Types.ObjectId.isValid(playerId)) {
    throw httpError(400, `Invalid ${role} player ID`, "INVALID_PLAYER_ID");
  }
  const player = await findPlayerById(playerId);
  if (!player) {
    throw new ScoringError(`${role} player does not exist`, 422, "PLAYER_NOT_FOUND");
  }
  return {
    playerId: cleanName(player._id || playerId),
    nameSnapshot: authoritativeName
      ? cleanName(player.name)
      : requested.nameSnapshot || cleanName(player.name),
  };
};

const findAuthoritativeParticipant = (items, reference, role) => {
  const requested = normalizeParticipant(reference);
  if (requested.playerId) return findParticipant(items, requested);
  const requestedName = normalizeIdentityText(requested.nameSnapshot);
  if (!requestedName) return null;
  const matches = (Array.isArray(items) ? items : []).filter((item) =>
    normalizeIdentityText(normalizeParticipant(item).nameSnapshot) === requestedName);
  if (matches.length > 1) {
    const error = new ScoringError(`Multiple ${role} candidates share that name; confirm the player ID`, 409, "PLAYER_CONFIRMATION_REQUIRED");
    error.details = { candidates: matches.map(normalizeParticipant) };
    throw error;
  }
  return matches[0] || null;
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
  match.currentBatsmenIds = [];
  match.currentBowler = "";
  match.currentBowlerId = "";
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
  const limits = matchLimits(match, {
    superOver: Boolean(match.isSuperOver),
    battingTeam: raw.battingTeam,
  });
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
  const active = activeBatters(before);
  const requestedBatter = findAuthoritativeParticipant(active, {
    playerId: req.body.batterId,
    nameSnapshot: req.body.batterNameSnapshot || req.body.batterName,
  }, "batter");
  const inferredNonStriker = requestedBatter
    ? active.find((batter) => !sameParticipant(batter, requestedBatter))
    : null;
  const draft = canonicalizeBallEvent({
    ...req.body,
    actionId: context.actionId,
    sequence: nextSequence(match),
    inningsNumber,
    nonStrikerName: req.body.nonStrikerName || inferredNonStriker?.name,
    nonStrikerId: req.body.nonStrikerId || inferredNonStriker?.playerId,
    isFreeHit: Boolean(before.freeHitPending),
  });
  const adjustment = draft.extraType === "penalty" || draft.extraType === "bonus";
  const nonDeliveryDismissal = draft.isWicket && draft.nonDelivery;
  if (adjustment && [
    draft.batterId,
    draft.batterName,
    draft.nonStrikerId,
    draft.nonStrikerName,
    draft.bowlerId,
    draft.bowlerName,
    draft.outPlayerId,
    draft.outPlayerName,
    draft.fielderId,
    draft.fielderName,
  ].some(Boolean)) {
    throw new ScoringError("A score adjustment cannot include player participants", 422, "INVALID_ADJUSTMENT");
  }
  if (nonDeliveryDismissal && (draft.bowlerId || draft.bowlerName)) {
    throw new ScoringError("A non-delivery dismissal cannot include a bowler", 422, "INVALID_BOWLER");
  }
  const bowlingTeam = before.bowlingTeam || teamOpposite(match, before.battingTeam);

  let batter = null;
  let nonStriker = null;
  let bowler = null;
  let dismissed = null;
  let fielder = null;
  if (!adjustment) {
    batter = requestedBatter;
    nonStriker = inferredNonStriker;
    if (!batter) throw new ScoringError("Selected striker is not an active batter", 422, "INVALID_STRIKER");
    await Promise.all([
      requireExistingPlayer(batter, "Batter"),
      requireExistingPlayer(nonStriker, "Non-striker"),
    ]);
    validateTeamParticipation(match, before.battingTeam, batter, "bat");
    validateTeamParticipation(match, before.battingTeam, nonStriker, "bat");
  }
  if (!adjustment && !nonDeliveryDismissal) {
    bowler = findAuthoritativeParticipant(before.bowlers, {
      playerId: draft.bowlerId,
      nameSnapshot: draft.bowlerNameSnapshot || draft.bowlerName,
    }, "bowler");
    if (!bowler) throw new ScoringError("Selected bowler has not been added to this innings", 422, "INVALID_BOWLER");
    await requireExistingPlayer(bowler, "Bowler");
    validateTeamParticipation(match, bowlingTeam, bowler, "bowl");
  }
  if (draft.isWicket) {
    dismissed = findAuthoritativeParticipant(active, {
      playerId: draft.outPlayerId,
      nameSnapshot: draft.outPlayerNameSnapshot || draft.outPlayerName,
    }, "dismissed batter");
    if (!dismissed) throw new ScoringError("Dismissed player is not an active batter", 422, "INVALID_DISMISSED_BATTER");
    await requireExistingPlayer(dismissed, "Dismissed batter");
    validateTeamParticipation(match, before.battingTeam, dismissed, "bat");
  }
  if (draft.fielderName || draft.fielderId) {
    fielder = await requireExistingPlayer({
      playerId: draft.fielderId,
      nameSnapshot: draft.fielderNameSnapshot || draft.fielderName,
    }, "Fielder");
  }

  const event = canonicalizeBallEvent({
    ...draft,
    batterId: batter?.playerId || "",
    batterName: batter?.nameSnapshot || batter?.name || "",
    batterNameSnapshot: batter?.nameSnapshot || batter?.name || "",
    nonStrikerId: nonStriker?.playerId || "",
    nonStrikerName: nonStriker?.nameSnapshot || nonStriker?.name || "",
    nonStrikerNameSnapshot: nonStriker?.nameSnapshot || nonStriker?.name || "",
    bowlerId: bowler?.playerId || "",
    bowlerName: bowler?.nameSnapshot || bowler?.name || "",
    bowlerNameSnapshot: bowler?.nameSnapshot || bowler?.name || "",
    outPlayerId: dismissed?.playerId || "",
    outPlayerName: dismissed?.nameSnapshot || dismissed?.name || "",
    outPlayerNameSnapshot: dismissed?.nameSnapshot || dismissed?.name || "",
    fielderId: fielder?.playerId || "",
    fielderName: fielder?.nameSnapshot || "",
    fielderNameSnapshot: fielder?.nameSnapshot || "",
    isFreeHit: Boolean(before.freeHitPending),
    rulesVersion: 2,
  });
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
  respondWithMatch(res, saved.match, {
    duplicate: saved.duplicate,
    isOverComplete,
    freeHitPending: Boolean(saved.match[key]?.freeHitPending),
    eventSequence: event.sequence,
  });
});

exports.addBatsman = asyncHandler(async (req, res) => {
  const loaded = await loadForMutation(req, "ADD_BATTER");
  if (loaded.duplicate) return respondWithMatch(res, loaded.match, { duplicate: true });
  const { match, context } = loaded;
  ensureMatchIsLive(match);
  const { inningsNumber, key } = ensureCurrentInnings(match, Number(req.params.num));
  const raw = prepareHistory(match[key]);
  const limits = matchLimits(match, {
    superOver: Boolean(match.isSuperOver),
    battingTeam: raw.battingTeam,
  });
  const current = rebuildInnings({
    battingTeam: raw.battingTeam,
    bowlingTeam: raw.bowlingTeam,
    baseline: raw.historyBase || null,
    events: raw.events,
    ...limits,
    target: inningsNumber === 2 ? match.target : null,
  });
  const participant = await requireExistingPlayer({
    playerId: req.body.playerId,
    nameSnapshot: req.body.nameSnapshot || req.body.name,
  }, "Batter", { authoritativeName: true });
  const name = participant.nameSnapshot;
  validateTeamParticipation(match, current.battingTeam, participant, "bat");

  if (current.bowlers.some((bowler) => sameParticipant(bowler, participant))) {
    throw new ScoringError("A selected bowler cannot bat for the opposing side", 422, "INVALID_BATTER_TEAM");
  }
  if (current.batsmen.some((batter) => sameParticipant(batter, participant) && batter.isOut)) {
    throw new ScoringError("A dismissed batter cannot return", 422, "BATTER_ALREADY_DISMISSED");
  }
  if (activeBatters(current).some((batter) => sameParticipant(batter, participant))) {
    return respondWithMatch(res, match, { idempotent: true });
  }
  if (activeBatters(current).length >= 2) throw new ScoringError("Two batters are already active", 422, "ACTIVE_BATTERS_FULL");
  
  const active = activeBatters(current);
  const isStriker = active.length === 0 || !active.some((batter) => batter.isStriker);
  const event = createControlEvent(ADD_BATTER, {
    actionId: context.actionId,
    sequence: nextSequence(match),
    inningsNumber,
    playerId: participant.playerId,
    nameSnapshot: name,
    isStriker,
    rulesVersion: 2,
  });
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
  const raw = prepareHistory(match[key]);
  const battingTeam = raw.battingTeam;
  const bowlingTeam = raw.bowlingTeam || teamOpposite(match, battingTeam);
  const limits = matchLimits(match, {
    superOver: Boolean(match.isSuperOver),
    battingTeam,
  });
  const current = rebuildInnings({
    battingTeam,
    bowlingTeam,
    baseline: raw.historyBase || null,
    events: raw.events,
    ...limits,
    target: inningsNumber === 2 ? match.target : null,
  });
  const participant = await requireExistingPlayer({
    playerId: req.body.playerId,
    nameSnapshot: req.body.nameSnapshot || req.body.name,
  }, "Bowler", { authoritativeName: true });
  const name = participant.nameSnapshot;
  validateTeamParticipation(match, bowlingTeam, participant, "bowl");

  const battingRoster = getPlayingXIForTeam(match, battingTeam);
  if (battingRoster && isInPlayingXI(participant, battingRoster)) {
    throw new ScoringError("A member of the batting team cannot be selected as bowler", 422, "INVALID_BOWLER_TEAM");
  }

  if (current.batsmen.some((batter) => sameParticipant(batter, participant))) {
    throw new ScoringError("A batter in this innings cannot be selected as bowler", 422, "INVALID_BOWLER_TEAM");
  }
  if (current.balls > 0 && current.balls % 6 === 0 && sameParticipant(
    { playerId: current.lastOverBowlerId, nameSnapshot: current.lastOverBowler },
    participant,
  )) {
    throw new ScoringError("A bowler cannot bowl consecutive overs", 422, "CONSECUTIVE_OVERS");
  }
  if (current.currentOverStarted && (current.currentBowlerId || current.currentBowler) && !sameParticipant(
    { playerId: current.currentBowlerId, nameSnapshot: current.currentBowler },
    participant,
  )) {
    throw new ScoringError("The bowler cannot be changed during an over", 422, "BOWLER_CHANGE_MID_OVER");
  }
  if (sameParticipant(
    { playerId: current.currentBowlerId, nameSnapshot: current.currentBowler },
    participant,
  )) {
    return respondWithMatch(res, match, { idempotent: true });
  }
  
  const event = createControlEvent(ADD_BOWLER, {
    actionId: context.actionId,
    sequence: nextSequence(match),
    inningsNumber,
    playerId: participant.playerId,
    nameSnapshot: name,
    rulesVersion: 2,
  });
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
  const requestedName = cleanName(req.body.nameSnapshot || req.body.name).slice(0, 120);
  const requestedId = cleanName(req.body.playerId);
  const reason = (cleanName(req.body.reason) || "Selected by admin").slice(0, 300);
  const participantValues = [
    ...(getPlayingXIForTeam(match, match.teamA)?.playingXI || []),
    ...(getPlayingXIForTeam(match, match.teamB)?.playingXI || []),
    ...(match.innings1?.batsmen || []),
    ...(match.innings1?.bowlers || []),
    ...(match.innings2?.batsmen || []),
    ...(match.innings2?.bowlers || []),
  ];
  let selected = null;
  if (requestedId || requestedName) {
    if (requestedId) {
      selected = findParticipant(participantValues, { playerId: requestedId, nameSnapshot: requestedName });
    } else {
      const matches = participantValues
        .map(normalizeParticipant)
        .filter((participant) => cleanName(participant.nameSnapshot).toLocaleLowerCase("en") === requestedName.toLocaleLowerCase("en"));
      const uniqueIds = [...new Set(matches.map((participant) => participant.playerId).filter(Boolean))];
      if (uniqueIds.length > 1) {
        const error = new ScoringError("Multiple match participants share that name; confirm the player ID", 409, "PLAYER_CONFIRMATION_REQUIRED");
        error.details = { candidates: matches };
        throw error;
      }
      selected = matches[0] || null;
    }
    if (!selected) throw new ScoringError("Man of the Match must be a match participant", 422, "INVALID_MAN_OF_MATCH");
    selected = await requireExistingPlayer(selected, "Man of the Match");
  }

  const statistics = clone(match.statistics) || {};
  statistics.manOfTheMatch = selected
    ? {
      playerId: selected.playerId,
      name: selected.nameSnapshot,
      nameSnapshot: selected.nameSnapshot,
      reason,
      selectedByAdmin: true,
      selectedAt: new Date(),
    }
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
  matchLimits,
  prepareHistory,
  projectInnings,
  scheduleDerivedRebuilds,
  synchronizeMatch,
  waitForDerivedRebuilds: () => derivedRebuildQueue,
};
