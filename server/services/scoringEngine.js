"use strict";

const {
  findParticipant,
  normalizeParticipant,
  participantKey,
  sameParticipant,
} = require("../utils/playerIdentity");

const BALL = "BALL";
const ADD_BATTER = "ADD_BATTER";
const ADD_BOWLER = "ADD_BOWLER";
const END_INNINGS = "END_INNINGS";
const COMMENTARY = "COMMENTARY";

const EVENT_TYPES = Object.freeze([BALL, ADD_BATTER, ADD_BOWLER, END_INNINGS, COMMENTARY]);
const EXTRA_TYPES = Object.freeze(["wide", "noBall", "bye", "legBye", "penalty", "bonus"]);

const WICKET_ALIASES = Object.freeze({
  bowled: "bowled",
  caught: "caught",
  lbw: "lbw",
  stumped: "stumped",
  runout: "runOut",
  "run-out": "runOut",
  runOut: "runOut",
  "hit-wicket": "hitWicket",
  hitwicket: "hitWicket",
  hitWicket: "hitWicket",
  "retired-hurt": "retiredHurt",
  retiredhurt: "retiredHurt",
  retiredHurt: "retiredHurt",
  "retired-out": "retiredOut",
  retiredout: "retiredOut",
  retiredOut: "retiredOut",
  "timed-out": "timedOut",
  timedout: "timedOut",
  timedOut: "timedOut",
  "obstructing-field": "obstructingField",
  obstructingfield: "obstructingField",
  obstructingField: "obstructingField",
  "hit-the-ball-twice": "hitBallTwice",
  hitballtwice: "hitBallTwice",
  hitBallTwice: "hitBallTwice",
});

const BOWLER_WICKET_TYPES = new Set(["bowled", "caught", "lbw", "stumped", "hitWicket"]);
const NON_DISMISSAL_TYPES = new Set(["retiredHurt"]);
const NON_DELIVERY_WICKET_TYPES = new Set(["retiredHurt", "retiredOut", "timedOut"]);
const ZERO_RUN_WICKET_TYPES = new Set(["bowled", "caught", "lbw", "stumped", "hitWicket"]);
const STRIKER_ONLY_WICKET_TYPES = new Set(["bowled", "caught", "lbw", "stumped", "hitWicket", "hitBallTwice"]);
const FIELDER_REQUIRED_WICKET_TYPES = new Set(["caught", "stumped", "runOut"]);

class ScoringError extends Error {
  constructor(message, status = 422, code = "INVALID_CRICKET_STATE") {
    super(message);
    this.name = "ScoringError";
    this.status = status;
    this.code = code;
  }
}

const clone = (value) => {
  if (value == null) return value;
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

const asObject = (value) => {
  if (!value) return value;
  return typeof value.toObject === "function" ? value.toObject({ depopulate: true }) : value;
};

const cleanName = (value) => String(value == null ? "" : value).trim();

const finiteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const nonNegativeInteger = (value, fallback = 0) => {
  const parsed = finiteNumber(value, fallback);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
};

const formatOvers = (legalBalls = 0) => {
  const balls = nonNegativeInteger(legalBalls);
  return `${Math.floor(balls / 6)}.${balls % 6}`;
};

const deliveryLabel = (legalBallsBeforeDelivery = 0) => {
  const balls = nonNegativeInteger(legalBallsBeforeDelivery);
  return `${Math.floor(balls / 6)}.${(balls % 6) + 1}`;
};

const emptyExtras = () => ({
  wides: 0,
  noBalls: 0,
  byes: 0,
  legByes: 0,
  penalties: 0,
  other: 0,
});

const emptyInningsState = (battingTeam = "", bowlingTeam = "") => ({
  battingTeam: cleanName(battingTeam),
  bowlingTeam: cleanName(bowlingTeam),
  runs: 0,
  wickets: 0,
  balls: 0,
  extras: 0,
  extrasBreakdown: emptyExtras(),
  batsmen: [],
  bowlers: [],
  commentary: [],
  fallOfWickets: [],
  partnerships: [],
  lastOverBowler: "",
  lastOverBowlerId: "",
  currentBowler: "",
  currentBowlerId: "",
  currentOverStarted: false,
  overHistory: [],
  milestones: [],
  recentBalls: [],
  freeHitPending: false,
  isDone: false,
  endReason: "",
});

const normalizeExtras = (raw, totalExtras) => {
  const extras = emptyExtras();
  const source = raw && typeof raw === "object" ? raw : {};
  extras.wides = nonNegativeInteger(source.wides);
  extras.noBalls = nonNegativeInteger(source.noBalls);
  extras.byes = nonNegativeInteger(source.byes);
  extras.legByes = nonNegativeInteger(source.legByes);
  extras.penalties = nonNegativeInteger(source.penalties);
  extras.other = nonNegativeInteger(source.other);

  const requestedTotal = nonNegativeInteger(totalExtras);
  const knownTotal = Object.values(extras).reduce((sum, value) => sum + value, 0);
  if (knownTotal < requestedTotal) extras.other += requestedTotal - knownTotal;
  return extras;
};

const normalizeBatsman = (raw = {}) => ({
  name: cleanName(raw.nameSnapshot || raw.name),
  nameSnapshot: cleanName(raw.nameSnapshot || raw.name),
  playerId: cleanName(raw.playerId || raw._id),
  runs: nonNegativeInteger(raw.runs),
  balls: nonNegativeInteger(raw.balls),
  fours: nonNegativeInteger(raw.fours),
  sixes: nonNegativeInteger(raw.sixes),
  isOut: Boolean(raw.isOut),
  isActive: typeof raw.isActive === "boolean" ? raw.isActive : !raw.isOut,
  dismissal: cleanName(raw.dismissal),
  isStriker: Boolean(raw.isStriker),
});

const normalizeBowler = (raw = {}) => ({
  name: cleanName(raw.nameSnapshot || raw.name),
  nameSnapshot: cleanName(raw.nameSnapshot || raw.name),
  playerId: cleanName(raw.playerId || raw._id),
  balls: nonNegativeInteger(raw.balls),
  maidens: nonNegativeInteger(raw.maidens),
  runs: nonNegativeInteger(raw.runs),
  wickets: nonNegativeInteger(raw.wickets),
  wides: nonNegativeInteger(raw.wides),
  noBalls: nonNegativeInteger(raw.noBalls),
});

const normalizeInningsState = (rawState, battingTeam = "", bowlingTeam = "") => {
  const raw = clone(asObject(rawState)) || {};
  const state = emptyInningsState(raw.battingTeam || battingTeam, raw.bowlingTeam || bowlingTeam);

  state.runs = nonNegativeInteger(raw.runs);
  state.wickets = nonNegativeInteger(raw.wickets);
  state.balls = nonNegativeInteger(raw.balls);
  state.extras = nonNegativeInteger(raw.extras);
  state.extrasBreakdown = normalizeExtras(raw.extrasBreakdown, state.extras);
  state.batsmen = Array.isArray(raw.batsmen) ? raw.batsmen.map(normalizeBatsman).filter((b) => b.name) : [];
  state.bowlers = Array.isArray(raw.bowlers) ? raw.bowlers.map(normalizeBowler).filter((b) => b.name) : [];
  state.commentary = Array.isArray(raw.commentary)
    ? clone(raw.commentary).filter((item) => item && cleanName(item.text)).map((item) => ({ ...item, text: cleanName(item.text).slice(0, 1000) }))
    : [];
  state.fallOfWickets = Array.isArray(raw.fallOfWickets) ? clone(raw.fallOfWickets) : [];
  state.partnerships = Array.isArray(raw.partnerships) ? clone(raw.partnerships) : [];
  state.lastOverBowler = cleanName(raw.lastOverBowler);
  state.lastOverBowlerId = cleanName(raw.lastOverBowlerId);
  state.currentBowler = cleanName(raw.currentBowler);
  state.currentBowlerId = cleanName(raw.currentBowlerId);
  state.overHistory = Array.isArray(raw.overHistory) ? clone(raw.overHistory) : [];
  state.milestones = Array.isArray(raw.milestones)
    ? clone(raw.milestones).filter((item) => item && typeof item === "object").map((item) => ({
      player: cleanName(item.player) || "Unknown",
      playerId: cleanName(item.playerId),
      nameSnapshot: cleanName(item.nameSnapshot || item.player) || "Unknown",
      type: cleanName(item.type) || "Achievement",
      over: cleanName(item.over) || "-",
      score: cleanName(item.score) || "-",
      createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
    }))
    : [];
  state.recentBalls = Array.isArray(raw.recentBalls) ? raw.recentBalls.map(String).slice(-12) : [];
  state.freeHitPending = Boolean(raw.freeHitPending);
  // Older documents receive the schema default (`false`) for this newly-added
  // field even when their legal-ball count proves an over is in progress. Do
  // not let that default unlock an impossible mid-over bowler change.
  state.currentOverStarted = raw.currentOverStarted === true ||
    state.balls % 6 !== 0 ||
    state.commentary.some((entry) => entry?.bowlerName && entry.over === deliveryLabel(state.balls));
  state.isDone = Boolean(raw.isDone);
  state.endReason = cleanName(raw.endReason);

  // Legacy documents did not have isActive. Keep at most the two live batters active.
  let activeCount = 0;
  for (const batter of state.batsmen) {
    if (batter.isOut) batter.isActive = false;
    if (batter.isActive && !batter.isOut) {
      activeCount += 1;
      if (activeCount > 2) batter.isActive = false;
    }
  }

  const active = state.batsmen.filter((b) => b.isActive && !b.isOut);
  const strikers = active.filter((b) => b.isStriker);
  if (strikers.length > 1) {
    active.forEach((b, index) => { b.isStriker = index === 0; });
  } else if (strikers.length === 0 && active.length > 0) {
    active[0].isStriker = true;
  }

  // Preserve the legacy team score while making its unexplained portion explicit.
  const batterRuns = state.batsmen.reduce((sum, batter) => sum + batter.runs, 0);
  const explainedExtras = Object.values(state.extrasBreakdown).reduce((sum, value) => sum + value, 0);
  const expectedExtras = Math.max(0, state.runs - batterRuns);
  if (expectedExtras > explainedExtras) state.extrasBreakdown.other += expectedExtras - explainedExtras;
  state.extras = Object.values(state.extrasBreakdown).reduce((sum, value) => sum + value, 0);

  return state;
};

const snapshotInningsState = (innings) => {
  const state = normalizeInningsState(innings, innings?.battingTeam, innings?.bowlingTeam);
  delete state.recentBalls;
  return state;
};

const hasMeaningfulLegacyState = (innings) => {
  if (!innings) return false;
  const raw = asObject(innings);
  return nonNegativeInteger(raw.runs) > 0 ||
    nonNegativeInteger(raw.wickets) > 0 ||
    nonNegativeInteger(raw.balls) > 0 ||
    (Array.isArray(raw.batsmen) && raw.batsmen.length > 0) ||
    (Array.isArray(raw.bowlers) && raw.bowlers.length > 0) ||
    (Array.isArray(raw.commentary) && raw.commentary.length > 0);
};

const activeBatters = (state) => state.batsmen.filter((b) => b.isActive && !b.isOut);

const identityReference = (playerId, nameSnapshot) => ({
  playerId: cleanName(playerId),
  nameSnapshot: cleanName(nameSnapshot),
});

const eventParticipant = (event, role = "player") => {
  if (role === "player") {
    return identityReference(event.playerId, event.nameSnapshot || event.playerName);
  }
  return identityReference(
    event[`${role}Id`],
    event[`${role}NameSnapshot`] || event[`${role}Name`],
  );
};

const participantName = (value) => normalizeParticipant(value).nameSnapshot;

const fixActiveStrike = (state) => {
  const active = activeBatters(state);
  if (active.length === 0) return;
  const strikers = active.filter((b) => b.isStriker);
  // With one survivor after a striker's wicket, no batter is on strike until
  // the incoming batter is added. Do not silently hand strike to the survivor.
  if (strikers.length === 0 && active.length > 1) active[0].isStriker = true;
  if (strikers.length > 1) active.forEach((b, index) => { b.isStriker = index === 0; });
};

const samePartnership = (partnership, participants) => {
  if (!partnership || !Array.isArray(participants) || participants.length !== 2) return false;
  const stored = Array.isArray(partnership.playerIds) && partnership.playerIds.some(Boolean)
    ? partnership.playerIds.map((playerId, index) => identityReference(
      playerId,
      partnership.nameSnapshots?.[index] || partnership.players?.[index],
    ))
    : (partnership.players || []).map((nameSnapshot) => identityReference("", nameSnapshot));
  return stored.length === 2 && stored.every((participant, index) => sameParticipant(participant, participants[index]));
};

const ensurePartnership = (state) => {
  const active = activeBatters(state);
  if (active.length !== 2) return;
  const participants = active.map(normalizeParticipant);
  const last = state.partnerships[state.partnerships.length - 1];
  if (last && !last.isClosed && samePartnership(last, participants)) return;
  state.partnerships.push({
    players: participants.map((participant) => participant.nameSnapshot),
    playerIds: participants.map((participant) => participant.playerId),
    nameSnapshots: participants.map((participant) => participant.nameSnapshot),
    runs: 0,
    balls: 0,
    isClosed: false,
  });
};

const normalizeWicketType = (value) => {
  if (!value) return "";
  const raw = String(value).trim();
  return WICKET_ALIASES[raw] || WICKET_ALIASES[raw.toLowerCase()] || "";
};

const isBowlerCreditedWicket = (event) => Boolean(
  event.isWicket &&
  event.extraType !== "noBall" &&
  BOWLER_WICKET_TYPES.has(event.wicketType)
);

const dismissalText = (event) => {
  const bowler = event.bowlerName || "Bowler";
  const fielder = event.fielderName || "Fielder";
  switch (event.wicketType) {
    case "caught": return `c ${fielder} b ${bowler}`;
    case "bowled": return `b ${bowler}`;
    case "lbw": return `lbw b ${bowler}`;
    case "stumped": return `st ${fielder} b ${bowler}`;
    case "runOut": return `run out (${fielder})`;
    case "hitWicket": return `hit wicket b ${bowler}`;
    case "retiredHurt": return "retired hurt";
    case "retiredOut": return "retired out";
    case "timedOut": return "timed out";
    case "obstructingField": return "obstructing the field";
    case "hitBallTwice": return "hit the ball twice";
    default: return "out";
  }
};

const defaultCommentary = (event) => {
  if (event.wicketType === "retiredHurt") return `${event.outPlayerName} retired hurt`;
  if (event.isWicket) return `WICKET! ${event.outPlayerName} ${dismissalText(event)}`;
  if (event.extraType === "wide") return `${event.extraRuns} wide${event.extraRuns === 1 ? "" : "s"}`;
  if (event.extraType === "noBall") return `No-ball, ${event.batsmanRuns + event.extraRuns} total`;
  if (event.extraType === "bye") return `${event.extraRuns} bye${event.extraRuns === 1 ? "" : "s"}`;
  if (event.extraType === "legBye") return `${event.extraRuns} leg bye${event.extraRuns === 1 ? "" : "s"}`;
  if (event.extraType === "penalty" || event.extraType === "bonus") return `${event.extraRuns} ${event.extraType} run${event.extraRuns === 1 ? "" : "s"}`;
  return `${event.batsmanRuns} run${event.batsmanRuns === 1 ? "" : "s"}`;
};

const deliverySymbol = (event) => {
  if (event.wicketType === "retiredHurt") return "RH";
  if (event.isWicket) return "W";
  if (event.extraType === "wide") return event.extraRuns === 1 ? "Wd" : `${event.extraRuns}Wd`;
  if (event.extraType === "noBall") return event.batsmanRuns ? `${event.batsmanRuns}Nb` : "Nb";
  if (event.extraType === "bye") return `${event.extraRuns}B`;
  if (event.extraType === "legBye") return `${event.extraRuns}Lb`;
  if (event.extraType === "penalty") return `${event.extraRuns}P`;
  if (event.extraType === "bonus") return `${event.extraRuns}+`;
  return String(event.batsmanRuns);
};

const canonicalizeBallEvent = (input = {}) => {
  const extraTypeRaw = input.extraType == null || input.extraType === "" ? "" : String(input.extraType);
  const extraType = extraTypeRaw === "no-ball" ? "noBall" : extraTypeRaw === "leg-bye" ? "legBye" : extraTypeRaw;
  if (extraType && !EXTRA_TYPES.includes(extraType)) {
    throw new ScoringError("Invalid extra type", 400, "INVALID_EXTRA_TYPE");
  }
  const secondaryExtraType = input.secondaryExtraType == null || input.secondaryExtraType === ""
    ? ""
    : String(input.secondaryExtraType);
  if (secondaryExtraType && !["bye", "legBye"].includes(secondaryExtraType)) {
    throw new ScoringError("Invalid secondary extra type", 400, "INVALID_SECONDARY_EXTRA");
  }

  const legacyRuns = input.runs == null || input.runs === "" ? 0 : Number(input.runs);
  if (!Number.isInteger(legacyRuns) || legacyRuns < 0 || legacyRuns > 20) {
    throw new ScoringError("Runs must be a whole number between 0 and 20", 400, "INVALID_RUNS");
  }

  let batsmanRuns = input.batsmanRuns == null ? null : finiteNumber(input.batsmanRuns, NaN);
  let extraRuns = input.extraRuns == null ? null : finiteNumber(input.extraRuns, NaN);
  if ((batsmanRuns == null) !== (extraRuns == null)) {
    throw new ScoringError("batsmanRuns and extraRuns must be provided together", 400, "INCOMPLETE_RUN_BREAKDOWN");
  }
  if (batsmanRuns != null && (!Number.isInteger(batsmanRuns) || batsmanRuns < 0 || batsmanRuns > 12)) {
    throw new ScoringError("Batsman runs must be a whole number between 0 and 12", 400, "INVALID_BATSMAN_RUNS");
  }
  if (extraRuns != null && (!Number.isInteger(extraRuns) || extraRuns < 0 || extraRuns > 20)) {
    throw new ScoringError("Extra runs must be a whole number between 0 and 20", 400, "INVALID_EXTRA_RUNS");
  }

  if (batsmanRuns == null || extraRuns == null) {
    switch (extraType) {
      case "wide":
        batsmanRuns = 0;
        extraRuns = 1 + legacyRuns;
        break;
      case "noBall":
        batsmanRuns = legacyRuns;
        extraRuns = 1;
        break;
      case "bye":
      case "legBye":
      case "penalty":
      case "bonus":
        batsmanRuns = 0;
        extraRuns = legacyRuns;
        break;
      default:
        batsmanRuns = legacyRuns;
        extraRuns = 0;
    }
  }

  if (!extraType && extraRuns !== 0) {
    throw new ScoringError("extraType is required when extraRuns is non-zero", 400, "MISSING_EXTRA_TYPE");
  }
  if ((extraType === "wide" || extraType === "noBall") && extraRuns < 1) {
    throw new ScoringError("A wide or no-ball must include its one-run penalty", 400, "INVALID_EXTRA_RUNS");
  }
  if (extraType === "wide" && batsmanRuns !== 0) {
    throw new ScoringError("Batsman runs cannot be scored from a wide", 400, "INVALID_WIDE");
  }
  if (["bye", "legBye"].includes(extraType) && batsmanRuns !== 0) {
    throw new ScoringError("Byes and leg byes cannot include batsman runs", 400, "INVALID_BYE_RUNS");
  }
  if (secondaryExtraType && extraType !== "noBall") {
    throw new ScoringError("secondaryExtraType is only valid for a no-ball", 400, "INVALID_SECONDARY_EXTRA");
  }
  if (extraType === "noBall" && secondaryExtraType && batsmanRuns !== 0) {
    throw new ScoringError("No-ball byes or leg byes cannot also include batsman runs", 400, "INVALID_NO_BALL_EXTRAS");
  }
  if (["bye", "legBye", "penalty", "bonus"].includes(extraType) && extraRuns < 1) {
    throw new ScoringError("The selected extra type must add at least one run", 400, "INVALID_EXTRA_RUNS");
  }

  const isWicket = Boolean(input.isWicket);
  const wicketType = isWicket ? normalizeWicketType(input.wicketType) : "";
  if (isWicket && !wicketType) {
    throw new ScoringError("A supported wicket type is required", 400, "INVALID_WICKET_TYPE");
  }
  if (isWicket && ZERO_RUN_WICKET_TYPES.has(wicketType) && batsmanRuns > 0) {
    throw new ScoringError("Batsman runs cannot accompany this wicket type", 422, "INVALID_WICKET_RUNS");
  }
  const nonDeliveryDismissal = isWicket && NON_DELIVERY_WICKET_TYPES.has(wicketType);
  if (nonDeliveryDismissal && (batsmanRuns !== 0 || extraRuns !== 0 || extraType)) {
    throw new ScoringError("A retirement or timed-out action cannot include delivery runs or extras", 422, "INVALID_NON_DELIVERY_WICKET");
  }
  if (isWicket && extraType === "noBall" && !["runOut", "obstructingField", "hitBallTwice"].includes(wicketType)) {
    throw new ScoringError("This dismissal is not valid from a no-ball", 422, "INVALID_NO_BALL_WICKET");
  }
  if (isWicket && extraType === "wide" && !["runOut", "stumped", "hitWicket", "obstructingField"].includes(wicketType)) {
    throw new ScoringError("This dismissal is not valid from a wide", 422, "INVALID_WIDE_WICKET");
  }
  if (isWicket && BOWLER_WICKET_TYPES.has(wicketType) && ["bye", "legBye"].includes(extraType)) {
    throw new ScoringError("This dismissal cannot be combined with byes or leg byes", 422, "INVALID_WICKET_EXTRAS");
  }

  const adjustment = extraType === "penalty" || extraType === "bonus";
  const legalDelivery = !adjustment && !nonDeliveryDismissal && extraType !== "wide" && extraType !== "noBall";
  const completedRunsDefault = extraType === "wide"
    ? Math.max(0, extraRuns - 1)
    : extraType === "noBall"
      ? batsmanRuns + Math.max(0, extraRuns - 1)
      : extraType === "penalty" || extraType === "bonus"
        ? 0
        : batsmanRuns + extraRuns;
  const completedRuns = input.completedRuns == null ? completedRunsDefault : Number(input.completedRuns);
  if (!Number.isInteger(completedRuns) || completedRuns < 0 || completedRuns > 20) {
    throw new ScoringError("Completed runs must be a whole number between 0 and 20", 400, "INVALID_COMPLETED_RUNS");
  }
  const maximumCompletedRuns = extraType === "wide"
    ? Math.max(0, extraRuns - 1)
    : extraType === "noBall"
      ? batsmanRuns + Math.max(0, extraRuns - 1)
      : adjustment
        ? 0
        : batsmanRuns + extraRuns;
  if (completedRuns > maximumCompletedRuns) {
    throw new ScoringError("Completed runs cannot exceed the runs physically available on the action", 422, "INVALID_COMPLETED_RUNS");
  }
  if (isWicket && ZERO_RUN_WICKET_TYPES.has(wicketType) && completedRuns !== 0) {
    throw new ScoringError("This dismissal cannot include completed runs", 422, "INVALID_WICKET_RUNS");
  }
  if (adjustment && (isWicket || batsmanRuns !== 0 || secondaryExtraType || completedRuns !== 0)) {
    throw new ScoringError("Penalty and bonus adjustments cannot be combined with a delivery or wicket", 422, "INVALID_ADJUSTMENT");
  }

  const event = {
    type: BALL,
    actionId: cleanName(input.actionId),
    sequence: nonNegativeInteger(input.sequence),
    inningsNumber: nonNegativeInteger(input.inningsNumber || input.inningsNum, 1),
    batterName: cleanName(input.batterNameSnapshot || input.batterName || input.strikerName),
    batterId: cleanName(input.batterId),
    batterNameSnapshot: cleanName(input.batterNameSnapshot || input.batterName || input.strikerName),
    nonStrikerName: cleanName(input.nonStrikerNameSnapshot || input.nonStrikerName),
    nonStrikerId: cleanName(input.nonStrikerId),
    nonStrikerNameSnapshot: cleanName(input.nonStrikerNameSnapshot || input.nonStrikerName),
    bowlerName: cleanName(input.bowlerNameSnapshot || input.bowlerName),
    bowlerId: cleanName(input.bowlerId),
    bowlerNameSnapshot: cleanName(input.bowlerNameSnapshot || input.bowlerName),
    batsmanRuns,
    extraRuns,
    extraType,
    secondaryExtraType,
    completedRuns,
    legalDelivery,
    nonDelivery: nonDeliveryDismissal,
    isWicket,
    wicketType,
    outPlayerName: cleanName(input.outPlayerNameSnapshot || input.outPlayerName || (isWicket ? (input.batterNameSnapshot || input.batterName) : "")),
    outPlayerId: cleanName(input.outPlayerId),
    outPlayerNameSnapshot: cleanName(input.outPlayerNameSnapshot || input.outPlayerName || (isWicket ? (input.batterNameSnapshot || input.batterName) : "")),
    fielderName: cleanName(input.fielderNameSnapshot || input.fielderName),
    fielderId: cleanName(input.fielderId),
    fielderNameSnapshot: cleanName(input.fielderNameSnapshot || input.fielderName),
    isFreeHit: input.isFreeHit == null ? undefined : Boolean(input.isFreeHit),
    commentary: cleanName(input.commentary).slice(0, 1000),
    symbol: cleanName(input.symbol),
    rulesVersion: nonNegativeInteger(input.rulesVersion, 2) || 2,
    createdAt: input.createdAt ? new Date(input.createdAt) : new Date(),
  };

  if (!adjustment && !event.batterName) {
    throw new ScoringError("Striker is required", 400, "STRIKER_REQUIRED");
  }
  if (!adjustment && !nonDeliveryDismissal && !event.bowlerName) {
    throw new ScoringError("Bowler is required", 400, "BOWLER_REQUIRED");
  }
  if (isWicket && !event.outPlayerName) {
    throw new ScoringError("Dismissed batter is required", 400, "DISMISSED_BATTER_REQUIRED");
  }
  if (isWicket && FIELDER_REQUIRED_WICKET_TYPES.has(event.wicketType) && !event.fielderName) {
    throw new ScoringError("Fielder is required for this dismissal", 400, "FIELDER_REQUIRED");
  }

  event.symbol ||= deliverySymbol(event);
  return event;
};

const validateBallAgainstState = (state, event) => {
  const adjustment = event.extraType === "penalty" || event.extraType === "bonus";
  const nonDeliveryDismissal = event.isWicket && NON_DELIVERY_WICKET_TYPES.has(event.wicketType);
  if (state.isDone) throw new ScoringError("Innings is already complete", 409, "INNINGS_COMPLETE");
  if (adjustment) return;

  if (state.freeHitPending && event.isWicket && !nonDeliveryDismissal) {
    throw new ScoringError("A delivery wicket cannot be recorded on a free hit", 422, "WICKET_ON_FREE_HIT");
  }

  const active = activeBatters(state);
  if (active.length !== 2) {
    throw new ScoringError("Exactly two active batters are required before scoring", 422, "INVALID_ACTIVE_BATTERS");
  }
  const batterReference = eventParticipant(event, "batter");
  const striker = active.find((batter) => sameParticipant(batter, batterReference) && batter.isStriker);
  if (!striker) throw new ScoringError("Selected striker is not an active batter", 422, "INVALID_STRIKER");
  const nonStriker = active.find((batter) => !sameParticipant(batter, striker));
  if (!nonStriker) {
    throw new ScoringError("Striker and non-striker must be different players", 422, "INVALID_BATTER_PAIR");
  }
  const nonStrikerReference = eventParticipant(event, "nonStriker");
  if ((nonStrikerReference.playerId || nonStrikerReference.nameSnapshot) &&
      !sameParticipant(nonStriker, nonStrikerReference)) {
    throw new ScoringError("Non-striker does not match the authoritative innings state", 409, "STALE_NON_STRIKER");
  }
  const dismissedReference = eventParticipant(event, "outPlayer");
  if (event.isWicket && !active.some((batter) => sameParticipant(batter, dismissedReference))) {
    throw new ScoringError("Dismissed player is not an active batter", 422, "INVALID_DISMISSED_BATTER");
  }
  if (event.isWicket && STRIKER_ONLY_WICKET_TYPES.has(event.wicketType) &&
      !sameParticipant(dismissedReference, batterReference)) {
    throw new ScoringError("This dismissal can only dismiss the striker", 422, "INVALID_DISMISSED_BATTER");
  }

  if (nonDeliveryDismissal) return;
  const bowlerReference = eventParticipant(event, "bowler");
  const bowler = findParticipant(state.bowlers, bowlerReference);
  if (!bowler) throw new ScoringError("Selected bowler has not been added to this innings", 422, "INVALID_BOWLER");
  if (active.some((batter) => sameParticipant(batter, bowlerReference))) {
    throw new ScoringError("A batting player cannot bowl in the same innings", 422, "INVALID_BOWLER_TEAM");
  }
  const currentBowlerReference = identityReference(state.currentBowlerId, state.currentBowler);
  if (state.currentOverStarted && (currentBowlerReference.playerId || currentBowlerReference.nameSnapshot) &&
      !sameParticipant(currentBowlerReference, bowlerReference)) {
    throw new ScoringError("The bowler cannot be changed during an over", 422, "BOWLER_CHANGE_MID_OVER");
  }

  // A bowler may bowl any number of overs. Only prevent consecutive overs.
  // This check runs at the start of a new legal over; wides/no-balls do not complete an over.
  const isNewLegalOver = state.balls > 0 &&
    state.balls % 6 === 0 &&
    event.extraType !== "wide" &&
    event.extraType !== "noBall";
  if (isNewLegalOver && sameParticipant(
    identityReference(state.lastOverBowlerId, state.lastOverBowler),
    bowlerReference,
  )) {
    throw new ScoringError("A bowler cannot bowl consecutive overs", 422, "CONSECUTIVE_OVERS");
  }
};

const addBattingMilestones = (state, batter, event) => {
  for (const threshold of [50, 100]) {
    if (batter.runs >= threshold && !state.milestones.some((milestone) =>
      sameParticipant(
        identityReference(milestone.playerId, milestone.nameSnapshot || milestone.player),
        batter,
      ) && milestone.type === String(threshold))) {
      state.milestones.push({
        player: batter.name,
        playerId: batter.playerId || "",
        nameSnapshot: batter.nameSnapshot || batter.name,
        type: String(threshold),
        over: deliveryLabel(Math.max(0, state.balls - (event.legalDelivery ? 1 : 0))),
        score: `${state.runs}/${state.wickets}`,
        createdAt: event.createdAt,
      });
    }
  }
};

const addBowlingMilestones = (state, bowler, event) => {
  for (const threshold of [3, 5]) {
    if (bowler.wickets >= threshold && !state.milestones.some((milestone) =>
      sameParticipant(
        identityReference(milestone.playerId, milestone.nameSnapshot || milestone.player),
        bowler,
      ) && milestone.type === `${threshold}W`)) {
      state.milestones.push({
        player: bowler.name,
        playerId: bowler.playerId || "",
        nameSnapshot: bowler.nameSnapshot || bowler.name,
        type: `${threshold}W`,
        over: deliveryLabel(Math.max(0, state.balls - (event.legalDelivery ? 1 : 0))),
        score: `${state.runs}/${state.wickets}`,
        createdAt: event.createdAt,
      });
    }
  }
};

const applyAddBatter = (state, event) => {
  const reference = eventParticipant(event, "player");
  const name = reference.nameSnapshot;
  if (!name) return;
  let batter = findParticipant(state.batsmen, reference);
  if (batter?.isOut) return;

  const activeBefore = activeBatters(state);
  if (!batter) {
    batter = normalizeBatsman({
      name,
      nameSnapshot: name,
      playerId: reference.playerId,
      isActive: activeBefore.length < 2,
      isStriker: false,
    });
    state.batsmen.push(batter);
  } else if (!batter.isActive && activeBefore.length < 2) {
    batter.isActive = true;
  }
  if (!batter.playerId && event.playerId) batter.playerId = cleanName(event.playerId);

  const active = activeBatters(state);
  if (!active.includes(batter)) return;
  if (typeof event.isStriker === "boolean") {
    if (event.isStriker) active.forEach((item) => { item.isStriker = item === batter; });
    else batter.isStriker = false;
  } else if (active.length === 1) {
    batter.isStriker = true;
  } else if (active.length === 2 && !active.some((item) => item.isStriker)) {
    batter.isStriker = true;
  }
  fixActiveStrike(state);
  ensurePartnership(state);
};

const applyAddBowler = (state, event) => {
  const reference = eventParticipant(event, "player");
  const name = reference.nameSnapshot;
  if (!name) return;
  if (state.currentOverStarted && (state.currentBowlerId || state.currentBowler) &&
      !sameParticipant(identityReference(state.currentBowlerId, state.currentBowler), reference)) {
    throw new ScoringError("The bowler cannot be changed during an over", 422, "BOWLER_CHANGE_MID_OVER");
  }
  let bowler = findParticipant(state.bowlers, reference);
  if (!bowler) {
    bowler = normalizeBowler({ name, nameSnapshot: name, playerId: reference.playerId });
    state.bowlers.push(bowler);
  } else if (!bowler.playerId && event.playerId) {
    bowler.playerId = cleanName(event.playerId);
  }
  state.currentBowler = name;
  state.currentBowlerId = bowler.playerId || reference.playerId;
};

const applyCommentary = (state, event) => {
  const text = cleanName(event.commentary || event.text).slice(0, 1000);
  if (!text) return;
  state.commentary.unshift({
    eventId: event.actionId,
    sequence: event.sequence,
    over: cleanName(event.over) || formatOvers(state.balls),
    text,
    runs: 0,
    isWicket: false,
    addedAt: event.createdAt,
  });
};

const applyDelivery = (state, event, replayContext) => {
  validateBallAgainstState(state, event);
  const adjustment = event.extraType === "penalty" || event.extraType === "bonus";
  const nonDeliveryDismissal = event.isWicket && NON_DELIVERY_WICKET_TYPES.has(event.wicketType);
  const administrativeAction = adjustment || nonDeliveryDismissal;
  const authoritativeFreeHit = Boolean(state.freeHitPending);
  if (event.isFreeHit != null && Boolean(event.isFreeHit) !== authoritativeFreeHit) {
    throw new ScoringError("Free-hit marker does not match the innings state", 409, "STALE_FREE_HIT_STATE");
  }
  event.isFreeHit = authoritativeFreeHit;
  const legalBallsBefore = state.balls;
  const over = nonDeliveryDismissal ? formatOvers(legalBallsBefore) : deliveryLabel(legalBallsBefore);
  const totalRuns = event.batsmanRuns + event.extraRuns;

  const batterReference = eventParticipant(event, "batter");
  let striker = adjustment ? null : activeBatters(state).find((batter) => sameParticipant(batter, batterReference));
  let nonStriker = adjustment ? null : activeBatters(state).find((batter) => !sameParticipant(batter, batterReference));
  if (!administrativeAction) {
    activeBatters(state).forEach((batter) => { batter.isStriker = sameParticipant(batter, batterReference); });
  }

  state.runs += totalRuns;
  state.extras += event.extraRuns;
  switch (event.extraType) {
    case "wide":
      state.extrasBreakdown.wides += event.extraRuns;
      break;
    case "noBall": {
      const automaticNoBall = Math.min(1, event.extraRuns);
      const remainder = event.extraRuns - automaticNoBall;
      state.extrasBreakdown.noBalls += automaticNoBall;
      if (event.secondaryExtraType === "bye") state.extrasBreakdown.byes += remainder;
      else if (event.secondaryExtraType === "legBye") state.extrasBreakdown.legByes += remainder;
      else state.extrasBreakdown.noBalls += remainder;
      break;
    }
    case "bye": state.extrasBreakdown.byes += event.extraRuns; break;
    case "legBye": state.extrasBreakdown.legByes += event.extraRuns; break;
    case "penalty":
    case "bonus": state.extrasBreakdown.penalties += event.extraRuns; break;
    default: break;
  }

  if (event.legalDelivery) state.balls += 1;

  let bowler;
  if (!administrativeAction) {
    striker.runs += event.batsmanRuns;
    if (event.legalDelivery) striker.balls += 1;
    if (event.batsmanRuns === 4) striker.fours += 1;
    if (event.batsmanRuns === 6) striker.sixes += 1;
    addBattingMilestones(state, striker, event);

    bowler = findParticipant(state.bowlers, eventParticipant(event, "bowler"));
    state.currentBowler = bowler.name;
    state.currentBowlerId = bowler.playerId || event.bowlerId;
    if (event.legalDelivery) bowler.balls += 1;
    let conceded = event.batsmanRuns;
    if (event.extraType === "wide") conceded += event.extraRuns;
    if (event.extraType === "noBall") {
      conceded += event.secondaryExtraType ? Math.min(1, event.extraRuns) : event.extraRuns;
      bowler.noBalls += 1;
    }
    if (event.extraType === "wide") bowler.wides += event.extraRuns;
    bowler.runs += conceded;
    state.currentOverStarted = true;
  }

  ensurePartnership(state);
  const currentPartnership = state.partnerships[state.partnerships.length - 1];
  if (currentPartnership && !currentPartnership.isClosed && !administrativeAction) {
    currentPartnership.runs += totalRuns;
    if (event.legalDelivery) currentPartnership.balls += 1;
  }

  const postRunStriker = event.completedRuns % 2 === 1 ? nonStriker : striker;
  const postRunNonStriker = event.completedRuns % 2 === 1 ? striker : nonStriker;
  const overComplete = event.legalDelivery && state.balls % 6 === 0;

  const countsAsWicket = event.isWicket && !NON_DISMISSAL_TYPES.has(event.wicketType);
  if (event.isWicket) {
    const dismissedReference = eventParticipant(event, "outPlayer");
    const dismissed = activeBatters(state).find((batter) => sameParticipant(batter, dismissedReference));
    if (dismissed) {
      dismissed.isActive = false;
      dismissed.isOut = countsAsWicket;
      dismissed.isStriker = false;
      dismissed.dismissal = dismissalText(event);
    }
    if (countsAsWicket) {
      state.wickets += 1;
      state.fallOfWickets.push({
        score: `${state.wickets}-${state.runs}`,
        over,
        player: event.outPlayerName,
        playerId: event.outPlayerId || dismissed?.playerId || "",
        nameSnapshot: event.outPlayerNameSnapshot || event.outPlayerName,
        wicketNum: state.wickets,
        eventId: event.actionId,
      });
      if (isBowlerCreditedWicket(event) && bowler) {
        bowler.wickets += 1;
        addBowlingMilestones(state, bowler, event);
      }
    }
    if (currentPartnership) currentPartnership.isClosed = true;

    const candidate = overComplete ? postRunNonStriker : postRunStriker;
    activeBatters(state).forEach((batter) => { batter.isStriker = Boolean(candidate && sameParticipant(batter, candidate)); });
  } else if (!adjustment) {
    const nextStriker = overComplete ? postRunNonStriker : postRunStriker;
    activeBatters(state).forEach((batter) => { batter.isStriker = Boolean(nextStriker && sameParticipant(batter, nextStriker)); });
  }

  state.commentary.unshift({
    eventId: event.actionId,
    sequence: event.sequence,
    over,
    text: event.commentary || defaultCommentary(event),
    runs: totalRuns,
    batsmanRuns: event.batsmanRuns,
    extraRuns: event.extraRuns,
    isWicket: countsAsWicket,
    extraType: event.extraType || undefined,
    wicketType: event.wicketType || undefined,
    outPlayerName: event.outPlayerName || undefined,
    outPlayerId: event.outPlayerId || undefined,
    outPlayerNameSnapshot: event.outPlayerNameSnapshot || event.outPlayerName || undefined,
    fielderName: event.fielderName || undefined,
    fielderId: event.fielderId || undefined,
    fielderNameSnapshot: event.fielderNameSnapshot || event.fielderName || undefined,
    batterName: event.batterName || undefined,
    batterId: event.batterId || undefined,
    batterNameSnapshot: event.batterNameSnapshot || event.batterName || undefined,
    bowlerName: event.bowlerName || undefined,
    bowlerId: event.bowlerId || undefined,
    bowlerNameSnapshot: event.bowlerNameSnapshot || event.bowlerName || undefined,
    isFreeHit: event.isFreeHit,
    addedAt: event.createdAt,
  });
  if (!administrativeAction) {
    state.recentBalls.push(event.symbol || deliverySymbol(event));
    state.recentBalls = state.recentBalls.slice(-12);
  }

  if (!administrativeAction) {
    replayContext.currentOver ||= {
      runs: 0,
      wickets: 0,
      extras: 0,
      bowlerRuns: 0,
      bowlerName: event.bowlerName,
      bowlerId: event.bowlerId,
      bowlerNameSnapshot: event.bowlerNameSnapshot || event.bowlerName,
    };
    replayContext.currentOver.runs += totalRuns;
    replayContext.currentOver.wickets += event.isWicket && !NON_DISMISSAL_TYPES.has(event.wicketType) ? 1 : 0;
    replayContext.currentOver.extras += event.extraRuns;
    replayContext.currentOver.bowlerName = event.bowlerName;
    replayContext.currentOver.bowlerId = event.bowlerId;
    replayContext.currentOver.bowlerNameSnapshot = event.bowlerNameSnapshot || event.bowlerName;
    replayContext.currentOver.bowlerRuns += bowler
      ? event.batsmanRuns +
        (event.extraType === "wide" ? event.extraRuns : 0) +
        (event.extraType === "noBall" ? (event.secondaryExtraType ? Math.min(1, event.extraRuns) : event.extraRuns) : 0)
      : 0;
  }

  if (overComplete) {
    const overData = replayContext.currentOver || {
      runs: 0,
      wickets: 0,
      extras: 0,
      bowlerRuns: 0,
      bowlerName: event.bowlerName,
      bowlerId: event.bowlerId,
      bowlerNameSnapshot: event.bowlerNameSnapshot || event.bowlerName,
    };
    const overRecord = {
      over: Math.floor(state.balls / 6),
      runs: nonNegativeInteger(overData.runs),
      wickets: nonNegativeInteger(overData.wickets),
      extras: nonNegativeInteger(overData.extras),
      bowlerName: cleanName(overData.bowlerName),
    };
    if (cleanName(overData.bowlerId)) {
      overRecord.bowlerId = cleanName(overData.bowlerId);
      overRecord.bowlerNameSnapshot = cleanName(overData.bowlerNameSnapshot || overData.bowlerName);
    }
    state.overHistory.push(overRecord);
    if (!replayContext.legacyPartialOver && overData.bowlerRuns === 0 && bowler) bowler.maidens += 1;
    state.lastOverBowler = event.bowlerName;
    state.lastOverBowlerId = bowler?.playerId || event.bowlerId;
    state.currentOverStarted = false;
    replayContext.currentOver = null;
    replayContext.legacyPartialOver = false;
  }

  if (!administrativeAction) {
    if (!replayContext.freeHitEnabled) state.freeHitPending = false;
    else if (event.extraType === "noBall") state.freeHitPending = true;
    else if (event.legalDelivery) state.freeHitPending = false;
  }

  fixActiveStrike(state);
};

const applyEndInnings = (state, event) => {
  state.isDone = true;
  state.freeHitPending = false;
  state.endReason = cleanName(event.reason) || "declared";
  state.commentary.unshift({
    eventId: event.actionId,
    sequence: event.sequence,
    over: formatOvers(state.balls),
    text: cleanName(event.commentary) || `Innings closed at ${state.runs}/${state.wickets}.`,
    runs: 0,
    isWicket: false,
    addedAt: event.createdAt,
  });
};

const rebuildInnings = ({
  battingTeam = "",
  bowlingTeam = "",
  baseline = null,
  events = [],
  maxWickets = 10,
  maxBalls = null,
  target = null,
  freeHitEnabled = true,
} = {}) => {
  const state = normalizeInningsState(baseline, battingTeam, bowlingTeam);
  state.battingTeam = cleanName(battingTeam || state.battingTeam);
  state.bowlingTeam = cleanName(bowlingTeam || state.bowlingTeam);
  // A legacy baseline may represent an innings that was already declared
  // before event history existed. That boundary is immutable and must remain
  // closed during replay; fresh event-backed innings have no baseline.
  state.isDone = Boolean(state.isDone);
  state.endReason = state.isDone ? (state.endReason || "legacyClosed") : "";
  state.recentBalls = [];
  if (!freeHitEnabled) state.freeHitPending = false;

  const replayContext = {
    currentOver: null,
    legacyPartialOver: Boolean(baseline && state.balls % 6 !== 0),
    freeHitEnabled: Boolean(freeHitEnabled),
  };

  const orderedEvents = Array.isArray(events) ? events.map((event) => clone(asObject(event))).filter(Boolean) : [];
  orderedEvents.sort((a, b) => finiteNumber(a.sequence) - finiteNumber(b.sequence));

  for (const rawEvent of orderedEvents) {
    const type = rawEvent.type;
    if (type === ADD_BATTER) applyAddBatter(state, rawEvent);
    else if (type === ADD_BOWLER) applyAddBowler(state, rawEvent);
    else if (type === COMMENTARY) applyCommentary(state, rawEvent);
    else if (type === END_INNINGS) applyEndInnings(state, rawEvent);
    else if (type === BALL) applyDelivery(state, canonicalizeBallEvent(rawEvent), replayContext);
  }

  if (state.wickets >= maxWickets) {
    state.isDone = true;
    state.endReason = "allOut";
  }
  if (Number.isFinite(maxBalls) && maxBalls >= 0 && state.balls >= maxBalls) {
    state.isDone = true;
    state.endReason = "oversComplete";
  }
  if (Number.isFinite(target) && target > 0 && state.runs >= target) {
    state.isDone = true;
    state.endReason = "targetReached";
  }
  if (state.isDone) state.freeHitPending = false;

  validateInningsInvariants(state, { maxWickets });
  return state;
};

const validateInningsInvariants = (state, { maxWickets = 10 } = {}) => {
  for (const field of ["runs", "wickets", "balls", "extras"]) {
    if (!Number.isInteger(state[field]) || state[field] < 0) {
      throw new ScoringError(`${field} must be a non-negative whole number`, 422, "INVARIANT_VIOLATION");
    }
  }
  if (state.wickets > maxWickets) {
    throw new ScoringError("Wickets exceed the innings limit", 422, "INVARIANT_VIOLATION");
  }
  const batterRuns = state.batsmen.reduce((sum, batter) => sum + nonNegativeInteger(batter.runs), 0);
  const extras = Object.values(state.extrasBreakdown).reduce((sum, value) => sum + nonNegativeInteger(value), 0);
  if (state.extras !== extras || state.runs !== batterRuns + extras) {
    throw new ScoringError("Team score does not match batsman runs plus extras", 422, "INVARIANT_VIOLATION");
  }
  const active = activeBatters(state);
  if (active.length > 2) throw new ScoringError("More than two active batters", 422, "INVARIANT_VIOLATION");
  const identities = new Set(active.map(participantKey));
  if (identities.has("") || identities.size !== active.length) {
    throw new ScoringError("Striker and non-striker must be different", 422, "INVARIANT_VIOLATION");
  }
  if (active.length === 2 && active.filter((b) => b.isStriker).length !== 1) {
    throw new ScoringError("Exactly one active batter must be on strike", 422, "INVARIANT_VIOLATION");
  }
  for (const batter of state.batsmen) {
    for (const field of ["runs", "balls", "fours", "sixes"]) {
      if (!Number.isInteger(batter[field]) || batter[field] < 0) throw new ScoringError("Invalid batter statistics", 422, "INVARIANT_VIOLATION");
    }
  }
  for (const bowler of state.bowlers) {
    for (const field of ["balls", "maidens", "runs", "wickets", "wides", "noBalls"]) {
      if (!Number.isInteger(bowler[field]) || bowler[field] < 0) throw new ScoringError("Invalid bowler statistics", 422, "INVARIANT_VIOLATION");
    }
  }
  return true;
};

const createControlEvent = (type, input = {}) => {
  if (!EVENT_TYPES.includes(type) || type === BALL) throw new ScoringError("Invalid control event type", 400, "INVALID_EVENT_TYPE");
  return {
    type,
    actionId: cleanName(input.actionId),
    sequence: nonNegativeInteger(input.sequence),
    inningsNumber: nonNegativeInteger(input.inningsNumber || input.inningsNum, 1),
    playerName: cleanName(input.nameSnapshot || input.playerName || input.name),
    playerId: cleanName(input.playerId),
    nameSnapshot: cleanName(input.nameSnapshot || input.playerName || input.name),
    isStriker: typeof input.isStriker === "boolean" ? input.isStriker : undefined,
    reason: cleanName(input.reason),
    commentary: cleanName(input.commentary || input.text).slice(0, 1000),
    over: cleanName(input.over),
    rulesVersion: nonNegativeInteger(input.rulesVersion, 2) || 2,
    createdAt: input.createdAt ? new Date(input.createdAt) : new Date(),
  };
};

const deriveMatchState = (match, { maxWickets = 10, maxBalls = null } = {}) => {
  const first = match.innings1;
  const second = match.innings2;
  if (!first) {
    match.currentInnings = 1;
    match.phase = "upcoming";
    match.target = 0;
    match.requiredRuns = 0;
    match.requiredRunRate = 0;
    match.recentBalls = [];
    match.currentBatsmen = [];
    match.currentBatsmenIds = [];
    match.currentBowler = "";
    match.currentBowlerId = "";
    return match;
  }

  if (!first.isDone) {
    match.currentInnings = 1;
    match.status = "live";
    match.phase = "firstInnings";
    match.result = "";
    match.target = 0;
    match.requiredRuns = 0;
    match.requiredRunRate = 0;
  } else {
    match.currentInnings = 2;
    match.target = nonNegativeInteger(first.runs) + 1;
    const chaseRuns = nonNegativeInteger(second?.runs);
    match.requiredRuns = Math.max(0, match.target - chaseRuns);
    const ballsRemaining = Number.isFinite(maxBalls) ? Math.max(0, maxBalls - nonNegativeInteger(second?.balls)) : null;
    match.requiredRunRate = ballsRemaining && match.requiredRuns > 0
      ? Number((match.requiredRuns / (ballsRemaining / 6)).toFixed(2))
      : 0;

    const chaseWon = Boolean(second && chaseRuns >= match.target);
    const chaseFinished = Boolean(second && (second.isDone || chaseWon));
    if (!chaseFinished) {
      match.status = "live";
      const hasSecondInningsBall = (Array.isArray(second?.events) && second.events.some((event) => event.type === BALL)) ||
        nonNegativeInteger(second?.balls) > 0 || chaseRuns > 0;
      match.phase = hasSecondInningsBall ? "secondInnings" : "inningsBreak";
      match.result = "";
    } else {
      match.status = "completed";
      match.phase = "finished";
      const firstTeam = first.battingTeam || match.teamA;
      const secondTeam = second.battingTeam || (firstTeam === match.teamA ? match.teamB : match.teamA);
      if (chaseWon) match.result = `${secondTeam} won by ${Math.max(0, maxWickets - nonNegativeInteger(second.wickets))} wickets`;
      else if (first.runs > chaseRuns) match.result = `${firstTeam} won by ${first.runs - chaseRuns} runs`;
      else match.result = "Match tied";
    }
  }

  const current = match.currentInnings === 2 ? match.innings2 : match.innings1;
  match.recentBalls = Array.isArray(current?.recentBalls) ? current.recentBalls.slice(-12) : [];
  match.currentBatsmen = current ? activeBatters(current).map((b) => b.name) : [];
  match.currentBatsmenIds = current ? activeBatters(current).map((b) => b.playerId || "") : [];
  match.currentBowler = cleanName(current?.currentBowler);
  match.currentBowlerId = cleanName(current?.currentBowlerId);
  return match;
};

module.exports = {
  BALL,
  ADD_BATTER,
  ADD_BOWLER,
  END_INNINGS,
  COMMENTARY,
  EVENT_TYPES,
  EXTRA_TYPES,
  ScoringError,
  activeBatters,
  canonicalizeBallEvent,
  cleanName,
  clone,
  createControlEvent,
  deriveMatchState,
  emptyInningsState,
  formatOvers,
  hasMeaningfulLegacyState,
  isBowlerCreditedWicket,
  normalizeInningsState,
  normalizeWicketType,
  rebuildInnings,
  snapshotInningsState,
  validateBallAgainstState,
  validateInningsInvariants,
};
