"use strict";

const clonePlain = (match) => {
  if (!match) return null;
  if (typeof match.toObject === "function") return match.toObject({ virtuals: true });
  // BSON values in lean Mongoose records (notably ObjectId) are corrupted by
  // native structuredClone. JSON uses their supported toJSON representation.
  return JSON.parse(JSON.stringify(match));
};

const scoreProjection = (innings) => innings ? {
  battingTeam: innings.battingTeam || "",
  runs: Number(innings.runs || 0),
  wickets: Number(innings.wickets || 0),
  legalBalls: Number(innings.balls || 0),
  overs: `${Math.floor(Number(innings.balls || 0) / 6)}.${Number(innings.balls || 0) % 6}`,
  isDone: Boolean(innings.isDone),
} : null;

const emptyMatchStatistics = () => ({
  players: [],
  manOfTheMatch: null,
  sixerKing: null,
  fourKing: null,
  highestScore: null,
  bestBowling: null,
  bestEconomy: null,
  highestStrikeRate: null,
  bestStrikeRate: null,
  bestBowlingAverage: null,
  bestBattingAverage: null,
});

const normalizeMatchStatistics = (statistics) => {
  const safe = emptyMatchStatistics();
  if (!statistics || typeof statistics !== "object") return safe;

  const keys = Object.keys(safe);
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(statistics, key)) {
      safe[key] = statistics[key];
    }
  }

  if (Array.isArray(statistics.players)) {
    safe.players = statistics.players;
  }

  return safe;
};

const serializeMatch = (match) => {
  const plain = clonePlain(match);
  if (!plain) return null;
  plain.statistics = normalizeMatchStatistics(plain.statistics);
  const regulation = [plain.innings1, plain.innings2].filter(Boolean);
  const findTeamScore = (team) => scoreProjection(regulation.find((innings) => innings.battingTeam === team));
  plain.teamScores = {
    teamA: { team: plain.teamA, score: findTeamScore(plain.teamA) },
    teamB: { team: plain.teamB, score: findTeamScore(plain.teamB) },
  };
  plain.stateVersion = Number(plain.__v || 0);
  plain.lastEventSequence = Number(plain.eventSequence || 0);

  const inningsKeys = ["innings1", "innings2", "superOverInnings1", "superOverInnings2"];
  const currentKey = plain.isSuperOver
    ? (plain.currentInnings === 2 ? "superOverInnings2" : "superOverInnings1")
    : (plain.currentInnings === 2 ? "innings2" : "innings1");
  const currentEvents = plain[currentKey]?.events;
  const firstKey = plain.isSuperOver ? "superOverInnings1" : "innings1";
  plain.canUndo = Boolean((Array.isArray(currentEvents) && currentEvents.length > 0) ||
    (plain.currentInnings === 2 && Array.isArray(plain[firstKey]?.events) && plain[firstKey].events.length > 0));
  plain.canRedo = Array.isArray(plain.redoStack) && plain.redoStack.length > 0;

  for (const key of inningsKeys) {
    const innings = plain[key];
    if (!innings) continue;
    innings.canUndo = Array.isArray(innings.events) && innings.events.length > 0;
    innings.historyBoundary = innings.historyBoundaryReason || "";
    delete innings.events;
    delete innings.historyBase;
    delete innings.historyBoundaryReason;
    delete innings.eventHistoryInitialized;
    delete innings.currentOverStarted;
    delete innings.redoStack;
    delete innings.rulesVersion;
  }
  delete plain.processedActions;
  delete plain.redoStack;
  return plain;
};

module.exports = { serializeMatch, scoreProjection };
