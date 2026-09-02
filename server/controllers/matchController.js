// server/controllers/matchController.js
const Match      = require("../models/Match");
const mongoose   = require("mongoose");
const Player     = require("../models/Player");
const { getLivePredictions } = require("../ai/predictionEngine");
const { Tournament } = require("../models/other");
const { rebuildAllPlayerStats } = require("./playerController");
const { serializeMatch } = require("../services/matchSerializer");
const {
  participantIds,
  playerIdOf,
  resolveParticipantEntries,
  snapshotOf,
} = require("../utils/playingXIResolver");
const {
  getMaxWicketsFromPlayingXI,
  getPlayingXIForTeam,
  normalizeParticipant,
  participantKey,
} = require("../utils/playerIdentity");

let _io;
exports.setSocket = (io) => { _io = io; };

const emit = (matchId, match) => {
  if (_io) _io.to(String(matchId)).emit("scoreUpdate", serializeMatch(match));
};

/* Public match reads */

exports.getMatches = async (req, res) => {
  try {
    const { status, tournament, series } = req.query;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const page = Math.max(1, Number(req.query.page) || 1);
    const query = {};
    if (status)     query.status     = status;
    if (tournament) query.tournament = tournament;
    if (series)     query.series     = series;

    const total   = await Match.countDocuments(query);
    const matches = await Match.find(query)
      .sort({ matchDate: status === "upcoming" ? 1 : -1 })
      .select("-innings1.events -innings1.historyBase -innings1.redoStack -innings2.events -innings2.historyBase -innings2.redoStack -superOverInnings1.events -superOverInnings1.historyBase -superOverInnings1.redoStack -superOverInnings2.events -superOverInnings2.historyBase -superOverInnings2.redoStack -processedActions -redoStack")
      .limit(limit)
      .skip((page - 1) * limit)
      .populate("tournament", "name shortName")
      .lean();

    res.json({ success: true, total, page, matches: matches.map(serializeMatch) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getMatch = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid Match ID" });
    }
    const match = await Match.findById(req.params.id).populate("tournament", "name shortName logo");
    if (!match) return res.status(404).json({ success: false, message: "Match not found" });

    res.json({ success: true, match: serializeMatch(match) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getLiveMatches = async (req, res) => {
  try {
    const matches = await Match.find({ status: "live" })
      .select("teamA teamB teamAShort teamBShort teamAFlag teamBFlag innings1.battingTeam innings1.runs innings1.wickets innings1.balls innings1.isDone innings2.battingTeam innings2.runs innings2.wickets innings2.balls innings2.isDone currentInnings recentBalls currentBatsmen currentBowler isFeatured matchTitle format videoUrl status phase target requiredRuns requiredRunRate result eventSequence")
      .lean();
    res.json({ success: true, matches: matches.map(serializeMatch) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const PLAYING_XI_SIDES = ["teamAPlayingXI", "teamBPlayingXI"];

const maxWicketsForTeam = (match, team) => getMaxWicketsFromPlayingXI(
  getPlayingXIForTeam(match, team, { legacyFallback: false }),
  10,
);

const duplicateIds = (participants) => {
  const seen = new Set();
  const duplicates = new Set();
  for (const participant of participants || []) {
    const playerId = String(participant?.playerId || "");
    if (!playerId) continue;
    if (seen.has(playerId)) duplicates.add(playerId);
    seen.add(playerId);
  }
  return [...duplicates];
};

const preparePlayingXI = ({ side, input, players, selectedAt }) => {
  const validationIssues = [];
  const resolutionIssues = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      roster: null,
      validationIssues: [{ side, code: "INVALID_PLAYING_XI", message: `${side} must be an object` }],
      resolutionIssues,
    };
  }

  const playingXI = input.playingXI;
  const substitutes = input.substitutes == null ? [] : input.substitutes;
  if (!Array.isArray(playingXI)) {
    validationIssues.push({ side, list: "playingXI", code: "PLAYING_XI_REQUIRED", message: "playingXI must be an array" });
  } else if (playingXI.length < 2 || playingXI.length > 11) {
    validationIssues.push({ side, list: "playingXI", code: "INVALID_PLAYING_XI_SIZE", message: "playingXI must contain between 2 and 11 players" });
  }
  if (!Array.isArray(substitutes)) {
    validationIssues.push({ side, list: "substitutes", code: "INVALID_SUBSTITUTES", message: "substitutes must be an array" });
  }
  if (validationIssues.length > 0) return { roster: null, validationIssues, resolutionIssues };

  const resolvedXI = resolveParticipantEntries({ entries: playingXI, players, side, list: "playingXI" });
  const resolvedSubstitutes = resolveParticipantEntries({ entries: substitutes, players, side, list: "substitutes" });
  validationIssues.push(...resolvedXI.validationIssues, ...resolvedSubstitutes.validationIssues);
  resolutionIssues.push(...resolvedXI.resolutionIssues, ...resolvedSubstitutes.resolutionIssues);

  const xiDuplicates = duplicateIds(resolvedXI.participants);
  const substituteDuplicates = duplicateIds(resolvedSubstitutes.participants);
  if (xiDuplicates.length > 0) {
    validationIssues.push({ side, list: "playingXI", code: "DUPLICATE_PLAYING_XI_PLAYER", message: "playingXI contains duplicate players", playerIds: xiDuplicates });
  }
  if (substituteDuplicates.length > 0) {
    validationIssues.push({ side, list: "substitutes", code: "DUPLICATE_SUBSTITUTE", message: "substitutes contains duplicate players", playerIds: substituteDuplicates });
  }

  const xiIds = new Set(participantIds(resolvedXI.participants));
  const rosterOverlap = participantIds(resolvedSubstitutes.participants).filter((playerId) => xiIds.has(playerId));
  if (rosterOverlap.length > 0) {
    validationIssues.push({ side, code: "PLAYING_XI_SUBSTITUTE_OVERLAP", message: "A substitute cannot also be in the Playing XI", playerIds: [...new Set(rosterOverlap)] });
  }

  const playersById = new Map((players || []).map((player) => [playerIdOf(player), player]));
  const validateRole = (field, label) => {
    const playerId = String(input[field] || "").trim();
    if (!playerId) return { playerId: "", nameSnapshot: "" };
    if (!mongoose.Types.ObjectId.isValid(playerId)) {
      validationIssues.push({ side, field, code: "INVALID_PLAYER_ID", message: `${label} must be a valid playerId` });
      return { playerId: "", nameSnapshot: "" };
    }
    if (!xiIds.has(playerId)) {
      validationIssues.push({ side, field, code: `${field === "captainId" ? "CAPTAIN" : "WICKET_KEEPER"}_NOT_IN_PLAYING_XI`, message: `${label} must be a member of the Playing XI` });
      return { playerId: "", nameSnapshot: "" };
    }
    const player = playersById.get(playerId);
    return { playerId, nameSnapshot: snapshotOf(player) };
  };

  const captain = validateRole("captainId", "Captain");
  const wicketKeeper = validateRole("wicketKeeperId", "Wicket keeper");
  const roster = {
    playingXI: resolvedXI.participants,
    substitutes: resolvedSubstitutes.participants,
    captainId: captain.playerId,
    captainName: captain.nameSnapshot,
    captainNameSnapshot: captain.nameSnapshot,
    wicketKeeperId: wicketKeeper.playerId,
    wicketKeeperName: wicketKeeper.nameSnapshot,
    wicketKeeperNameSnapshot: wicketKeeper.nameSnapshot,
    selectedAt,
  };
  return { roster, validationIssues, resolutionIssues };
};

const rosterPlayerIds = (roster) => new Set([
  ...participantIds(roster?.playingXI),
  ...participantIds(roster?.substitutes),
]);

exports.updatePlayingXI = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid Match ID", code: "INVALID_MATCH_ID" });
    }
    const requestedSides = PLAYING_XI_SIDES.filter((side) => Object.prototype.hasOwnProperty.call(req.body || {}, side));
    if (requestedSides.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Provide teamAPlayingXI, teamBPlayingXI, or both",
        code: "PLAYING_XI_REQUIRED",
      });
    }

    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ success: false, message: "Match not found", code: "MATCH_NOT_FOUND" });
    if (match.status !== "upcoming" || match.innings1) {
      return res.status(409).json({
        success: false,
        message: "Playing XI cannot be changed after scoring has started",
        code: "PLAYING_XI_LOCKED",
      });
    }

    const players = await Player.find({}).select("_id name fullName team").lean();
    const selectedAt = new Date();
    const prepared = new Map();
    const validationIssues = [];
    const resolutionIssues = [];
    for (const side of requestedSides) {
      const result = preparePlayingXI({ side, input: req.body[side], players, selectedAt });
      prepared.set(side, result.roster);
      validationIssues.push(...result.validationIssues);
      resolutionIssues.push(...result.resolutionIssues);
    }
    if (validationIssues.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Playing XI validation failed",
        code: "INVALID_PLAYING_XI",
        validationIssues,
      });
    }
    if (resolutionIssues.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Player resolution requires confirmation",
        code: "PLAYER_RESOLUTION_REQUIRED",
        resolutionIssues,
      });
    }

    const effectiveA = prepared.get("teamAPlayingXI") || match.teamAPlayingXI;
    const effectiveB = prepared.get("teamBPlayingXI") || match.teamBPlayingXI;
    const teamAIds = rosterPlayerIds(effectiveA);
    const crossTeamIds = [...rosterPlayerIds(effectiveB)].filter((playerId) => teamAIds.has(playerId));
    if (crossTeamIds.length > 0) {
      return res.status(400).json({
        success: false,
        message: "A player cannot be selected for both teams",
        code: "PLAYER_ON_BOTH_TEAMS",
        validationIssues: [{ code: "PLAYER_ON_BOTH_TEAMS", playerIds: crossTeamIds }],
      });
    }

    for (const [side, roster] of prepared) {
      match[side] = roster;
      match[side === "teamAPlayingXI" ? "teamAParticipants" : "teamBParticipants"] =
        roster.playingXI.map((participant) => ({ ...participant }));
    }
    const saved = await match.save();
    emit(saved._id, saved);
    return res.json({ success: true, match: serializeMatch(saved) });
  } catch (err) {
    if (err.name === "VersionError") {
      return res.status(409).json({ success: false, message: "Match changed while the Playing XI was being edited", code: "PLAYING_XI_CONFLICT" });
    }
    const status = err.name === "ValidationError" || err.name === "CastError" ? 400 : 500;
    return res.status(status).json({
      success: false,
      message: status === 500 ? "Unable to update Playing XI" : err.message,
      code: status === 500 ? "PLAYING_XI_UPDATE_FAILED" : "INVALID_PLAYING_XI",
    });
  }
};

exports._playingXITest = {
  duplicateIds,
  maxWicketsForTeam,
  preparePlayingXI,
  rosterPlayerIds,
};

/* Admin match metadata CRUD */

exports.createMatch = async (req, res) => {
  try {
    const allowed = [
      "teamA", "teamB", "teamAShort", "teamBShort", "teamAFlag", "teamBFlag",
      "matchTitle", "series", "format", "venue", "city", "matchDate", "matchNumber",
      "overs", "videoUrl", "isFeatured", "tournament", "squadA", "squadB"
    ];
    const createData = {};
    for (const key of allowed) if (Object.prototype.hasOwnProperty.call(req.body, key)) createData[key] = req.body[key];
    createData.status = "upcoming";
    createData.phase = "upcoming";
    if (!createData.teamA || !createData.teamB || createData.teamA === createData.teamB) {
      return res.status(400).json({ success: false, message: "Two different teams are required" });
    }
    const match = await Match.create(createData);
    if (createData.tournament) await Tournament.findByIdAndUpdate(createData.tournament, { $addToSet: { matches: match._id } });
    res.status(201).json({ success: true, match: serializeMatch(match) });
  } catch (err) {
    const status = err.name === "ValidationError" || err.name === "CastError" ? 400 : 500;
    res.status(status).json({ success: false, message: status === 500 ? "Unable to create match" : err.message });
  }
};

exports.updateMatch = async (req, res) => {
  try {
    // Whitelist allowed fields for update
    const allowed = [
      "teamA", "teamB", "teamAShort", "teamBShort", "teamAFlag", "teamBFlag", "matchTitle", "series",
      "format", "venue", "city", "matchDate", "matchNumber", "overs",
      "videoUrl", "isFeatured", "tournament", "squadA", "squadB"
    ];
    const updateData = {};
    Object.keys(req.body).forEach(key => { if (allowed.includes(key)) updateData[key] = req.body[key]; });

    const existingMatch = await Match.findById(req.params.id);
    if (!existingMatch) return res.status(404).json({ success: false, message: "Match not found" });

    if (existingMatch.innings1) {
      for (const field of ["teamA", "teamB", "format", "overs", "squadA", "squadB"]) {
        if (Object.prototype.hasOwnProperty.call(updateData, field) && JSON.stringify(updateData[field]) !== JSON.stringify(existingMatch[field])) {
          return res.status(409).json({ success: false, message: `${field} cannot be changed after scoring has started` });
        }
      }
    }

    if (req.body.tournament && String(req.body.tournament) !== String(existingMatch.tournament)) {
      await Tournament.findByIdAndUpdate(existingMatch.tournament, { $pull: { matches: existingMatch._id } });
      await Tournament.findByIdAndUpdate(req.body.tournament, { $addToSet: { matches: existingMatch._id } });
    } else if (req.body.tournament === null && existingMatch.tournament) {
      await Tournament.findByIdAndUpdate(existingMatch.tournament, { $pull: { matches: existingMatch._id } });
    }

    existingMatch.set(updateData);
    const match = await existingMatch.save();
    emit(match._id, match);
    if (match.status === "completed") {
      try { await rebuildAllPlayerStats(); } catch (e) { console.error("Failed to rebuild player stats", e); }
    }
    res.json({ success: true, match: serializeMatch(match) });
  } catch (err) {
    if (err.name === "VersionError") return res.status(409).json({ success: false, message: "Match changed while it was being edited" });
    const status = err.name === "ValidationError" || err.name === "CastError" ? 400 : 500;
    res.status(status).json({ success: false, message: status === 500 ? "Unable to update match" : err.message });
  }
};

exports.deleteMatch = async (req, res) => {
  try {
    const match = await Match.findByIdAndDelete(req.params.id);
    if (!match) return res.status(404).json({ success: false, message: "Match not found" });
    
    // Remove the deleted match from the tournament roster and rebuild standings
    if (match.tournament) {
      try {
        await Tournament.findByIdAndUpdate(match.tournament, { $pull: { matches: match._id } });
        // Rebuild points table (definition appears later in the file)
        await rebuildPointsTable(match.tournament);
      } catch (e) {
        console.error("Failed to update tournament after match deletion", e);
      }
    }
    
    // Rebuild player stats if match was completed
    if (match.status === "completed") {
      try {
        await rebuildAllPlayerStats();
      } catch (e) {
        console.error("Failed to rebuild player stats after match deletion", e);
      }
    }
    
    res.json({ success: true, message: "Match deleted and points table updated" });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};


/* Live scoring mutations are implemented exclusively in liveScoringController.js. */

const inferResultState = (match) => {
  const resStr = (match.result || "").toLowerCase();

  if (resStr.includes("abandon") || resStr.includes("no result")) {
    return { winner: null, isTie: false, isNR: true };
  }

  if (resStr.includes("won")) {
    const teamA = (match.teamA || "").toLowerCase();
    const teamB = (match.teamB || "").toLowerCase();
    const teamAShort = (match.teamAShort || "").toLowerCase();
    const teamBShort = (match.teamBShort || "").toLowerCase();

    if (teamA && (resStr.includes(teamA) || (teamAShort && resStr.includes(teamAShort)))) {
      return { winner: match.teamA, isTie: false, isNR: false };
    }
    if (teamB && (resStr.includes(teamB) || (teamBShort && resStr.includes(teamBShort)))) {
      return { winner: match.teamB, isTie: false, isNR: false };
    }
  }

  if (resStr.includes("tie")) {
    return { winner: null, isTie: true, isNR: false };
  }

  if (match.isSuperOver) {
    const so1 = match.superOverInnings1 || {};
    const so2 = match.superOverInnings2 || {};
    const so1Runs = Number(so1.runs || 0);
    const so2Runs = Number(so2.runs || 0);

    if (so1Runs > so2Runs) return { winner: so1.battingTeam || match.teamA, isTie: false, isNR: false };
    if (so2Runs > so1Runs) return { winner: so2.battingTeam || match.teamB, isTie: false, isNR: false };
    if (so1Runs > 0 || so2Runs > 0) return { winner: null, isTie: true, isNR: false };
  }

  const r1 = Number(match.innings1?.runs || 0);
  const r2 = Number(match.innings2?.runs || 0);

  if (r1 > r2) return { winner: match.innings1?.battingTeam || match.teamA, isTie: false, isNR: false };
  if (r2 > r1) return { winner: match.innings2?.battingTeam || match.teamB, isTie: false, isNR: false };
  if (r1 > 0 || r2 > 0) return { winner: null, isTie: true, isNR: false };

  return { winner: null, isTie: false, isNR: true };
};

function rebuildPointsTable(tournamentId) {
  if (!tournamentId) return;
  return (async () => {
    try {
      const tourney = await Tournament.findById(tournamentId).populate("matches");
      if (!tourney || !tourney.teams) return;


    const table = {};
    tourney.teams.forEach(t => {
      table[t] = { team: t, played: 0, won: 0, lost: 0, tied: 0, nr: 0, points: 0, nrr: "0.000", totalRuns: 0, totalBalls: 0, totalRunsConceded: 0, totalBallsBowled: 0 };
    });

    tourney.matches.forEach(m => {
      if (!m || m.status !== "completed") return;
      
      const { winner, isTie, isNR } = inferResultState(m);

      const tA = m.teamA;
      const tB = m.teamB;
      if (!table[tA]) table[tA] = { team: tA, played: 0, won: 0, lost: 0, tied: 0, nr: 0, points: 0, nrr: "0.000", totalRuns: 0, totalBalls: 0, totalRunsConceded: 0, totalBallsBowled: 0 };
      if (!table[tB]) table[tB] = { team: tB, played: 0, won: 0, lost: 0, tied: 0, nr: 0, points: 0, nrr: "0.000", totalRuns: 0, totalBalls: 0, totalRunsConceded: 0, totalBallsBowled: 0 };

      table[tA].played++;
      table[tB].played++;

      if (winner === tA) { table[tA].won++; table[tA].points += 2; table[tB].lost++; }
      else if (winner === tB) { table[tB].won++; table[tB].points += 2; table[tA].lost++; }
      else if (isTie) { table[tA].tied++; table[tB].tied++; table[tA].points += 1; table[tB].points += 1; }
      if (isNR) { table[tA].nr++; table[tB].nr++; table[tA].points += 1; table[tB].points += 1; }

      // NRR calculation only applies to matches with a result (not abandoned/NR)
      if (isNR) return;

      const inn1 = m.innings1;
      const inn2 = m.innings2;
      if (inn1 && inn1.balls > 0) {
        const batTeam = inn1.battingTeam === tA ? tA : tB;
        const bowlTeam = batTeam === tA ? tB : tA;
        const maxWicketsForNRR = maxWicketsForTeam(m, batTeam);
        let b = inn1.balls;
        if (inn1.wickets >= maxWicketsForNRR) b = (m.overs || 20) * 6;
        table[batTeam].totalRuns += inn1.runs;
        table[batTeam].totalBalls += b;
        table[bowlTeam].totalRunsConceded += inn1.runs;
        table[bowlTeam].totalBallsBowled += b;
      }
      if (inn2 && inn2.balls > 0) {
        const batTeam = inn2.battingTeam === tA ? tA : tB;
        const bowlTeam = batTeam === tA ? tB : tA;
        const maxWicketsForNRR = maxWicketsForTeam(m, batTeam);
        let b = inn2.balls;
        if (inn2.wickets >= maxWicketsForNRR) b = (m.overs || 20) * 6;
        table[batTeam].totalRuns += inn2.runs;
        table[batTeam].totalBalls += b;
        table[bowlTeam].totalRunsConceded += inn2.runs;
        table[bowlTeam].totalBallsBowled += b;
      }
    });

    Object.values(table).forEach(row => {
      const scoredOvers = row.totalBalls / 6;
      const concededOvers = row.totalBallsBowled / 6;
      const scoredRate = scoredOvers > 0 ? row.totalRuns / scoredOvers : 0;
      const concededRate = concededOvers > 0 ? row.totalRunsConceded / concededOvers : 0;
      const nrr = scoredRate - concededRate;
      row.nrr = (nrr > 0 ? "+" : "") + nrr.toFixed(3);
    });

    tourney.pointsTable = Object.values(table).sort((a, b) => 
      b.points - a.points || 
      b.won - a.won || 
      parseFloat(b.nrr) - parseFloat(a.nrr)
    );
    await tourney.save();
    } catch(e) { console.error("Points table rebuild failed", e); }
  })();
}

// Rebuild player leaderboards (tournament-level) by aggregating match.statistics
exports.rebuildPlayerLeaderboards = async (tournamentId) => {
  const { Tournament } = require("../models/other");
  if (!tournamentId) return null;
  try {
    const tourney = await Tournament.findById(tournamentId).populate("matches");
    if (!tourney) return null;

    const agg = new Map(); // immutable playerId -> aggregated stats

    for (const m of tourney.matches) {
      if (!m || m.status !== "completed") continue;

      // Ensure match statistics exist
      let stats = m.statistics && Object.keys(m.statistics || {}).length > 0 ? m.statistics : null;
      if (!stats) {
        try { computeMatchStatistics(m); stats = m.statistics; } catch(e) { /* ignore */ }
      }
      if (!stats || !Array.isArray(stats.players)) continue;

      stats.players.forEach(p => {
        const participant = normalizeParticipant(p);
        // Unresolved legacy name-only rows are intentionally not merged into a
        // leaderboard. The identity migration reports them for confirmation.
        if (!participant.playerId) return;
        const dest = agg.get(participant.playerId) || {
          playerId: participant.playerId,
          _id: participant.playerId,
          name: participant.nameSnapshot,
          nameSnapshot: participant.nameSnapshot,
          runs: 0,
          balls: 0,
          fours: 0,
          sixes: 0,
          wickets: 0,
          ballsBowled: 0,
          runsConceded: 0,
          maidens: 0,
          points: 0,
        };
        if (!dest.nameSnapshot && participant.nameSnapshot) {
          dest.name = participant.nameSnapshot;
          dest.nameSnapshot = participant.nameSnapshot;
        }
        dest.runs += p.runs || 0;
        dest.balls += p.balls || 0;
        dest.fours += p.fours || 0;
        dest.sixes += p.sixes || 0;
        dest.wickets += p.wickets || 0;
        dest.ballsBowled += p.ballsBowled || 0;
        dest.runsConceded += p.runsConceded || 0;
        dest.maidens += p.maidens || 0;
        dest.points += p.points || 0;
        agg.set(participant.playerId, dest);
      });
    }

    const players = [...agg.values()].map(p => {
      const strikeRate = p.balls > 0 ? (p.runs / p.balls) * 100 : 0;
      const overs = p.ballsBowled ? (p.ballsBowled / 6) : 0;
      const economy = p.ballsBowled > 0 ? (p.runsConceded / overs) : null;
      // Bowling average = runsConceded / wickets (NOT runs / wickets)
      const bowlingAverage = p.wickets > 0 ? (p.runsConceded / p.wickets) : null;
      return Object.assign({}, p, { strikeRate: Math.round(strikeRate), economy: economy === null ? null : parseFloat(economy.toFixed(2)), overs: parseFloat(overs.toFixed(2)), average: bowlingAverage === null ? null : parseFloat(bowlingAverage.toFixed(2)) });
    });

    // Derive leaderboards
    const overall = players.slice().sort((a,b) => b.points - a.points || b.wickets - a.wickets || b.runs - a.runs).slice(0,50);
    const sixes = players.slice().sort((a,b) => b.sixes - a.sixes || b.runs - a.runs).slice(0,20);
    const fours = players.slice().sort((a,b) => b.fours - a.fours || b.runs - a.runs).slice(0,20);
    const strike = players.slice().filter(p => p.balls >= 10).sort((a,b) => b.strikeRate - a.strikeRate).slice(0,20);
    const economy = players.slice().filter(p => p.ballsBowled >= 6).sort((a,b) => (a.economy === null ? 999 : a.economy) - (b.economy === null ? 999 : b.economy)).slice(0,20);
    const average = players.slice().filter(p => p.runs >= 20).sort((a,b) => b.average - a.average).slice(0,20);

    const leaderboards = { overall, sixes, fours, strike, economy, average };

    tourney.playerLeaderboards = leaderboards;
    await tourney.save();
    return leaderboards;
  } catch (e) { console.error("rebuildPlayerLeaderboards failed", e); return null; }
};

// Compute per-match statistics and decide Man of the Match
function computeMatchStatistics(match) {
  if (!match) return {
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
    bestBattingAverage: null
  };
  const players = new Map(); // immutable player identity -> aggregated stats

  const ensureStatisticsPlayer = (entry) => {
    const participant = normalizeParticipant(entry);
    const key = participantKey(participant);
    if (!key || !participant.nameSnapshot) return null;
    if (!players.has(key)) {
      players.set(key, {
        playerId: participant.playerId,
        _id: participant.playerId || undefined,
        name: participant.nameSnapshot,
        nameSnapshot: participant.nameSnapshot,
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        outs: 0,
        wickets: 0,
        ballsBowled: 0,
        runsConceded: 0,
        maidens: 0,
        identityKey: key,
      });
    }
    return players.get(key);
  };

  const ingestInnings = (inn) => {
    if (!inn) return;
    if (Array.isArray(inn.batsmen)) {
      inn.batsmen.forEach(b => {
        const p = ensureStatisticsPlayer(b);
        if (!p) return;
        p.runs += (b.runs || 0);
        p.balls += (b.balls || 0);
        p.fours += (b.fours || 0);
        p.sixes += (b.sixes || 0);
        if (b.isOut) p.outs += 1;
      });
    }
    if (Array.isArray(inn.bowlers)) {
      inn.bowlers.forEach(b => {
        const p = ensureStatisticsPlayer(b);
        if (!p) return;
        p.wickets += (b.wickets || 0);
        p.ballsBowled += (b.balls || 0);
        p.runsConceded += (b.runs || 0);
        p.maidens += (b.maidens || 0);
      });
    }
  };

  // Use main innings (ignore super over for awards by default)
  ingestInnings(match.innings1);
  ingestInnings(match.innings2);

  // Recent (finisher) stats: collect last N balls faced per player (from commentary)
  const recentMap = new Map(); // immutable player identity -> recent legal-ball runs
  const collectRecentFrom = (inn, maxBalls = 6) => {
    if (!inn || !Array.isArray(inn.commentary)) return;
    for (const c of inn.commentary) {
      if (!c || !c.batterName) continue;
      const participant = normalizeParticipant({
        playerId: c.batterId,
        nameSnapshot: c.batterNameSnapshot || c.batterName,
      });
      const key = participantKey(participant);
      if (!key) continue;
      // exclude wides and no-balls for ball count
      if (c.extraType === "wide" || c.extraType === "noBall") continue;
      const runsOffBat = (c.extraType === "bye" || c.extraType === "legBye") ? 0 : (c.runs || 0);
      const recent = recentMap.get(key) || [];
      if (recent.length < maxBalls) recent.push(runsOffBat);
      recentMap.set(key, recent);
    }
  };
  collectRecentFrom(match.innings1, 6);
  collectRecentFrom(match.innings2, 6);

  // Calculate derived metrics and points
  const playerList = [...players.values()].map(p => {
    const strikeRate = p.balls > 0 ? (p.runs / p.balls) * 100 : 0;
    const overs = p.ballsBowled ? (p.ballsBowled / 6) : 0;
    const oversDisplay = `${Math.floor((p.ballsBowled || 0) / 6)}.${(p.ballsBowled || 0) % 6}`;
    const economy = p.ballsBowled > 0 ? (p.runsConceded / overs) : null;
    const average = p.outs > 0 ? (p.runs / p.outs) : (p.runs || 0);

    // Points formula (simple heuristic)
    let points = 0;
    points += (p.runs || 0) * 1;              // 1 pt per run
    points += (p.fours || 0) * 1;             // 1 pt per four
    points += (p.sixes || 0) * 2;             // 2 pt per six
    if ((p.runs || 0) >= 50) points += 10;    // fifty bonus
    if ((p.runs || 0) >= 100) points += 20;   // century bonus
    points += (p.wickets || 0) * 25;         // 25 pt per wicket
    if ((p.wickets || 0) >= 3) points += 10;  // 3+ wicket bonus
    // Strike rate bonus requires a minimum balls faced
    const minBallsForSRBonus = 10;
    if (p.balls >= minBallsForSRBonus) {
      if (strikeRate >= 150) points += 10;
      else if (strikeRate >= 130) points += 5;
    }
    if (economy !== null) {
      if (economy < 6) points += 10;
      else if (economy < 8) points += 5;
    }

    // Finisher bonus: player's recent strike rate in last up-to-6 balls they faced
    const recent = recentMap.get(p.identityKey) || [];
    if (recent.length >= 3) {
      const recentRuns = recent.reduce((a,b) => a + (b || 0), 0);
      const recentSR = (recentRuns / recent.length) * 100;
      if (recentSR >= 200) points += 8;    // explosive finisher
      else if (recentSR >= 175) points += 5;
    }

    const { identityKey: _identityKey, ...publicPlayer } = p;
    return Object.assign({}, publicPlayer, { strikeRate: Math.round(strikeRate), economy: economy === null ? null : parseFloat(economy.toFixed(2)), overs: oversDisplay, average: parseFloat(average.toFixed(2)), points });
  });

  const emptyStatistics = {
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
    bestBattingAverage: null
  };

  if (playerList.length === 0) {
    match.statistics = emptyStatistics;
    return match.statistics;
  }

  // Top performers
  const sixerKing = playerList.slice().sort((a,b) => b.sixes - a.sixes || b.runs - a.runs)[0];
  const fourKing = playerList.slice().sort((a,b) => b.fours - a.fours || b.runs - a.runs)[0];
  const topScore = playerList.slice().sort((a,b) => b.runs - a.runs || b.strikeRate - a.strikeRate)[0];
  const mostHundreds = playerList.slice().filter(p => p.runs >= 100).sort((a,b) => b.runs - a.runs || b.sixes - a.sixes)[0] || null;
  const mostFifties = playerList.slice().filter(p => p.runs >= 50).sort((a,b) => b.runs - a.runs || b.fours - a.fours)[0] || null;
  const mostThirties = playerList.slice().filter(p => p.runs >= 30 && p.runs < 50).sort((a,b) => b.runs - a.runs || b.fours - a.fours)[0] || null;
  const mostFours = playerList.slice().sort((a,b) => b.fours - a.fours || b.runs - a.runs)[0];
  const mostSixes = playerList.slice().sort((a,b) => b.sixes - a.sixes || b.runs - a.runs)[0];
  const highestStrike = playerList.slice().filter(p => p.balls > 0).sort((a,b) => b.strikeRate - a.strikeRate || b.runs - a.runs)[0];
  const mostWickets = playerList.slice().sort((a,b) => b.wickets - a.wickets || a.runsConceded - b.runsConceded)[0];
  const bestBowlingAverage = playerList.slice().filter(p => p.wickets > 0).sort((a,b) => (a.runsConceded / a.wickets) - (b.runsConceded / b.wickets) || b.wickets - a.wickets)[0] || null;
  const bestBowling = playerList.slice().filter(p => p.wickets > 0).sort((a,b) => b.wickets - a.wickets || a.runsConceded - b.runsConceded)[0] || null;
  const mostThreeWicketsHaul = playerList.slice().filter(p => p.wickets >= 3).sort((a,b) => b.wickets - a.wickets || a.runsConceded - b.runsConceded)[0] || null;
  const mostFiveWicketsHaul = playerList.slice().filter(p => p.wickets >= 5).sort((a,b) => b.wickets - a.wickets || a.runsConceded - b.runsConceded)[0] || null;
  const bestEconomy = playerList.slice().filter(p => p.ballsBowled >= 6).sort((a,b) => (a.economy === null ? 1 : a.economy) - (b.economy === null ? 1 : b.economy) || b.wickets - a.wickets)[0] || null;
  const bestAverage = playerList.slice().filter(p => p.runs > 0).sort((a,b) => b.average - a.average || b.runs - a.runs)[0];

  // Man of the Match by points, tiebreaker wickets then runs
  const mom = playerList.slice().sort((a,b) => b.points - a.points || b.wickets - a.wickets || b.runs - a.runs)[0];

  const performer = (player, fields) => player ? {
    playerId: player.playerId || "",
    _id: player.playerId || undefined,
    name: player.nameSnapshot || player.name,
    nameSnapshot: player.nameSnapshot || player.name,
    ...Object.fromEntries(fields.map((field) => [field, player[field]])),
  } : null;

  const stats = {
    players: playerList,
    manOfTheMatch: mom ? { ...performer(mom, ["points", "runs", "wickets"]), reason: mom.points } : null,
    sixerKing: performer(sixerKing, ["sixes"]),
    fourKing: performer(fourKing, ["fours"]),
    highestScore: performer(topScore, ["runs", "balls"]),
    bestBattingAverage: performer(bestAverage, ["average", "runs", "outs"]),
    bestStrikeRate: performer(highestStrike, ["strikeRate", "runs", "balls"]),
    highestStrikeRate: performer(highestStrike, ["strikeRate", "runs", "balls"]),
    mostHundreds: performer(mostHundreds, ["runs"]),
    mostFifties: performer(mostFifties, ["runs"]),
    mostThirties: performer(mostThirties, ["runs"]),
    mostFours: performer(mostFours, ["fours"]),
    mostSixes: performer(mostSixes, ["sixes"]),
    mostWickets: performer(mostWickets, ["wickets", "runsConceded"]),
    bestBowlingAverage: bestBowlingAverage ? {
      ...performer(bestBowlingAverage, ["wickets", "runsConceded"]),
      average: parseFloat((bestBowlingAverage.runsConceded / bestBowlingAverage.wickets).toFixed(2)),
    } : null,
    bestBowling: performer(bestBowling, ["wickets", "runsConceded"]),
    mostThreeWicketsHaul: performer(mostThreeWicketsHaul, ["wickets", "runsConceded"]),
    mostFiveWicketsHaul: performer(mostFiveWicketsHaul, ["wickets", "runsConceded"]),
    bestEconomy: performer(bestEconomy, ["economy", "overs", "runsConceded", "wickets"]),
  };
  match.statistics = stats;
  return stats;
};

const predictionsCache = new Map();
const PREDICTIONS_TTL = 30000; // 30 seconds TTL for AI predictions

exports.getMatchPredictions = async (req, res) => {
  try {
    const matchId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(matchId)) {
      return res.status(400).json({ success: false, message: "Invalid Match ID" });
    }
    const now = Date.now();

    if (predictionsCache.has(matchId)) {
      const cached = predictionsCache.get(matchId);
      if (now - cached.timestamp < PREDICTIONS_TTL) {
        return res.json({ success: true, data: cached.data });
      }
    }

    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ success: false, message: "Match not found" });
    const predictions = await getLivePredictions(match);
    
    for (const [key, cached] of predictionsCache) {
      if (now - cached.timestamp >= PREDICTIONS_TTL) predictionsCache.delete(key);
    }
    if (predictionsCache.size >= 1000) predictionsCache.delete(predictionsCache.keys().next().value);
    predictionsCache.set(matchId, { data: predictions, timestamp: now });

    res.json({ success: true, data: predictions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Shared post-commit projections used by the event-based live scoring controller.
exports.computeMatchStatistics = computeMatchStatistics;
exports.rebuildPointsTable = rebuildPointsTable;
