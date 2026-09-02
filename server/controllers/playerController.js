// server/controllers/playerController.js
const Match = require("../models/Match");
const Player = require("../models/Player");
const { pagination, pick, validationStatus } = require("../utils/input");

const WRITABLE_PLAYER_FIELDS = [
  "name", "fullName", "team", "photo", "dateOfBirth", "role",
  "battingStyle", "bowlingStyle", "bio", "isFeatured", "isCaptain", "isViceCaptain",
  "baseBatting", "baseBowling", "rankings",
];

const normalizePlayerId = (value) => {
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

const normalizePlayerName = (value) => String(value || "").trim();
const playerNameKey = (value) => normalizePlayerName(value).toLocaleLowerCase("en");

const getNameSnapshot = (item) => {
  if (typeof item === "string") return normalizePlayerName(item);
  return normalizePlayerName(item?.nameSnapshot || item?.name || item?.playerName);
};

const getEmbeddedPlayerId = (item) => {
  if (!item || typeof item === "string") return "";
  return normalizePlayerId(item.playerId || item._id);
};

/**
 * Build the authoritative lookup used by every statistics path. Names are
 * deliberately mapped to arrays: a legacy name is safe only when exactly one
 * Player document owns it.
 */
const createPlayerDirectory = (players = []) => {
  const byId = new Map();
  const byName = new Map();

  for (const player of players) {
    const playerId = normalizePlayerId(player?._id || player?.playerId);
    if (!playerId) continue;
    byId.set(playerId, player);

    const nameKey = playerNameKey(player?.name);
    if (!nameKey) continue;
    const candidates = byName.get(nameKey) || [];
    candidates.push(player);
    byName.set(nameKey, candidates);
  }

  return { byId, byName };
};

/**
 * Resolve an embedded match/statistics participant without guessing. A
 * supplied playerId remains the identity even if its Player profile has since
 * been removed. Name-only legacy rows resolve only to a unique Player name.
 */
const resolveEmbeddedPlayer = (item, directory) => {
  const playerId = getEmbeddedPlayerId(item);
  const suppliedSnapshot = getNameSnapshot(item);
  if (playerId) {
    const player = directory.byId.get(playerId) || null;
    return {
      playerId,
      player,
      nameSnapshot: suppliedSnapshot || normalizePlayerName(player?.name) || "Unknown",
      legacy: false,
    };
  }

  const nameKey = playerNameKey(suppliedSnapshot);
  if (!nameKey) return null;
  const candidates = directory.byName.get(nameKey) || [];
  if (candidates.length !== 1) return null;

  const player = candidates[0];
  return {
    playerId: normalizePlayerId(player._id || player.playerId),
    player,
    nameSnapshot: suppliedSnapshot || normalizePlayerName(player.name),
    legacy: true,
  };
};

const calculateMatchPoints = (p) => {
  const runs = p.runs || 0;
  const fours = p.fours || 0;
  const sixes = p.sixes || 0;
  const wickets = p.wickets || 0;
  const balls = p.balls || 0;
  const ballsBowled = p.ballsBowled || 0;
  const runsConceded = p.runsConceded || 0;

  let points = 0;
  points += runs;
  points += fours;
  points += sixes * 2;
  if (runs >= 50) points += 10;
  if (runs >= 100) points += 20;
  points += wickets * 25;
  if (wickets >= 3) points += 10;
  if (balls >= 10) {
    const sr = (runs / balls) * 100;
    if (sr >= 150) points += 10;
    else if (sr >= 130) points += 5;
  }
  if (ballsBowled > 0) {
    const economy = runsConceded / (ballsBowled / 6);
    if (economy < 6) points += 10;
    else if (economy < 8) points += 5;
  }
  return points;
};

const getPlayersByNames = async (req, res) => {
  try {
    const names = req.query.names
      ? String(req.query.names).split(",").map(n => n.trim()).filter(Boolean).slice(0, 50)
      : [];
    if (names.length === 0) return res.json({ success: true, players: [] });
    const players = await Player.find({ name: { $in: names } }).select("name photo team").lean();
    res.json({ success: true, players });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getPlayersByNames = getPlayersByNames;

const emptyRankedPlayer = (identity) => ({
  playerId: identity.playerId,
  _id: identity.playerId,
  nameSnapshot: identity.nameSnapshot,
  name: normalizePlayerName(identity.player?.name) || identity.nameSnapshot,
  runs: 0,
  balls: 0,
  fours: 0,
  sixes: 0,
  wickets: 0,
  ballsBowled: 0,
  runsConceded: 0,
  maidens: 0,
  points: 0,
});

const extractPlayerStatsFromMatch = (match, directory) => {
  const players = new Map();
  const ensure = (item) => {
    const identity = resolveEmbeddedPlayer(item, directory);
    if (!identity?.playerId) return null;
    if (!players.has(identity.playerId)) {
      players.set(identity.playerId, emptyRankedPlayer(identity));
    }
    const destination = players.get(identity.playerId);
    if (!destination.nameSnapshot && identity.nameSnapshot) destination.nameSnapshot = identity.nameSnapshot;
    return destination;
  };

  const statisticsPlayers = Array.isArray(match?.statistics?.players)
    ? match.statistics.players
    : [];
  // Match statistics are preferred only when every row has an unambiguous
  // identity. If an old name-grouped statistics blob is ambiguous, rebuilding
  // from innings rows can still recover identities already backfilled there.
  const resolvedStatistics = statisticsPlayers.map((player) => ({
    player,
    identity: resolveEmbeddedPlayer(player, directory),
  }));
  const statisticsAreSafe = resolvedStatistics.length > 0 &&
    resolvedStatistics.every(({ identity }) => Boolean(identity?.playerId));

  if (statisticsAreSafe) {
    for (const { player } of resolvedStatistics) {
      const dest = ensure(player);
      if (!dest) continue;
      dest.runs += Number(player.runs || 0);
      dest.balls += Number(player.balls || 0);
      dest.fours += Number(player.fours || 0);
      dest.sixes += Number(player.sixes || 0);
      dest.wickets += Number(player.wickets || 0);
      dest.ballsBowled += Number(player.ballsBowled || 0);
      dest.runsConceded += Number(player.runsConceded || 0);
      dest.maidens += Number(player.maidens || 0);
      dest.points += typeof player.points === "number" ? player.points : calculateMatchPoints(player);
    }
    return [...players.values()];
  }

  const ingestInnings = (innings) => {
    if (!innings) return;
    for (const batter of Array.isArray(innings.batsmen) ? innings.batsmen : []) {
      const dest = ensure(batter);
      if (!dest) continue;
      dest.runs += Number(batter.runs || 0);
      dest.balls += Number(batter.balls || 0);
      dest.fours += Number(batter.fours || 0);
      dest.sixes += Number(batter.sixes || 0);
    }
    for (const bowler of Array.isArray(innings.bowlers) ? innings.bowlers : []) {
      const dest = ensure(bowler);
      if (!dest) continue;
      dest.wickets += Number(bowler.wickets || 0);
      dest.ballsBowled += Number(bowler.balls || 0);
      dest.runsConceded += Number(bowler.runs || 0);
      dest.maidens += Number(bowler.maidens || 0);
    }
  };

  ingestInnings(match?.innings1);
  ingestInnings(match?.innings2);
  return [...players.values()].map((player) => ({
    ...player,
    points: calculateMatchPoints(player),
  }));
};

const aggregatePointsFromMatches = (matches, directory) => {
  const aggregate = new Map();

  for (const match of matches) {
    for (const player of extractPlayerStatsFromMatch(match, directory)) {
      const playerId = normalizePlayerId(player.playerId || player._id);
      if (!playerId) continue;
      if (!aggregate.has(playerId)) {
        aggregate.set(playerId, {
          playerId,
          _id: playerId,
          nameSnapshot: player.nameSnapshot,
          name: player.name || player.nameSnapshot,
          matches: 0,
          runs: 0,
          balls: 0,
          fours: 0,
          sixes: 0,
          wickets: 0,
          ballsBowled: 0,
          runsConceded: 0,
          maidens: 0,
          points: 0,
        });
      }
      const dest = aggregate.get(playerId);
      dest.matches += 1;
      dest.runs += Number(player.runs || 0);
      dest.balls += Number(player.balls || 0);
      dest.fours += Number(player.fours || 0);
      dest.sixes += Number(player.sixes || 0);
      dest.wickets += Number(player.wickets || 0);
      dest.ballsBowled += Number(player.ballsBowled || 0);
      dest.runsConceded += Number(player.runsConceded || 0);
      dest.maidens += Number(player.maidens || 0);
      dest.points += Number(player.points || 0);
    }
  }

  return [...aggregate.values()];
};

const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getPointsRankings = async ({ format = "T20", limit = 20, minMatches = 1 }) => {
  const query = { status: "completed" };
  const normalizedFormat = String(format || "").trim();
  const minMatchesNum = Math.max(1, parseInt(minMatches, 10) || 1);
  if (normalizedFormat) {
    if (normalizedFormat.toLowerCase() === "t20") {
      query.format = /^t20/i;
    } else {
      query.format = new RegExp(`^${escapeRegExp(normalizedFormat)}$`, "i");
    }
  }
  const [matches, playerProfiles] = await Promise.all([
    Match.find(query).lean(),
    Player.find({}).select("name fullName team photo role").lean(),
  ]);
  const directory = createPlayerDirectory(playerProfiles);

  const players = aggregatePointsFromMatches(matches, directory).map((p) => {
    const strikeRate = p.balls > 0 ? (p.runs / p.balls) * 100 : 0;
    const overs = p.ballsBowled / 6;
    const economy = p.ballsBowled > 0 ? p.runsConceded / overs : null;
    // Bowling average = runsConceded / wickets (NOT runs / wickets)
    const bowlingAverage = p.wickets > 0 ? p.runsConceded / p.wickets : null;
    return {
      ...p,
      strikeRate: Math.round(strikeRate),
      economy: economy === null ? null : parseFloat(economy.toFixed(2)),
      average: bowlingAverage === null ? null : parseFloat(bowlingAverage.toFixed(2))
    };
  });

  players.sort((a, b) => b.points - a.points || b.wickets - a.wickets || b.runs - a.runs);
  // apply minimum-match filter
  const filtered = players.filter(p => (p.matches || 0) >= minMatchesNum);
  const safeLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 20));
  const topPlayers = filtered.slice(0, safeLimit);

  return topPlayers.map((p) => {
    const playerId = normalizePlayerId(p.playerId || p._id);
    const detail = directory.byId.get(playerId) || {};
    return {
      ...p,
      playerId,
      _id: detail._id || playerId,
      nameSnapshot: p.nameSnapshot || normalizePlayerName(detail.name),
      name: normalizePlayerName(detail.name) || p.nameSnapshot || p.name,
      team: detail.team || "",
      photo: detail.photo || ""
    };
  });
};

// GET /api/players?role=&search=&page=1
exports.getPlayers = async (req, res) => {
  try {
    const { team, role, search, featured } = req.query;
    const { page, limit, skip } = pagination(req.query, { defaultLimit: 20, maxLimit: 100 });
    const query = {};
    if (team)     query.team       = team;
    if (role)     query.role       = role;
    if (featured) query.isFeatured = true;
    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { name: new RegExp(escapedSearch, "i") },
        { fullName: new RegExp(escapedSearch, "i") }
      ];
    }
    const total   = await Player.countDocuments(query);
    const players = await Player.find(query)
      .sort({ "batting.runs": -1 })
      .limit(limit)
      .skip(skip)
      .lean();
    res.json({ success: true, total, players });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const legacyArrayParticipantQuery = (path, name) => ({
  [path]: {
    $elemMatch: {
      playerId: { $in: ["", null] },
      $or: [{ name }, { nameSnapshot: name }],
    },
  },
});

const buildPlayerMatchConditions = (playerId, name, allowLegacyName) => {
  const conditions = [
    { "innings1.batsmen.playerId": playerId },
    { "innings1.bowlers.playerId": playerId },
    { "innings2.batsmen.playerId": playerId },
    { "innings2.bowlers.playerId": playerId },
    { "statistics.players.playerId": playerId },
    { "statistics.players._id": playerId },
    { squadA: playerId },
    { squadB: playerId },
    { "squadA.playerId": playerId },
    { "squadB.playerId": playerId },
    { "teamAPlayingXI.playingXI": playerId },
    { "teamBPlayingXI.playingXI": playerId },
    { "teamAPlayingXI.playingXI.playerId": playerId },
    { "teamBPlayingXI.playingXI.playerId": playerId },
  ];

  if (!allowLegacyName) return conditions;
  conditions.push(
    legacyArrayParticipantQuery("innings1.batsmen", name),
    legacyArrayParticipantQuery("innings1.bowlers", name),
    legacyArrayParticipantQuery("innings2.batsmen", name),
    legacyArrayParticipantQuery("innings2.bowlers", name),
    legacyArrayParticipantQuery("statistics.players", name),
    { squadA: name },
    { squadB: name },
    { "teamAPlayingXI.playingXI": name },
    { "teamBPlayingXI.playingXI": name },
  );
  return conditions;
};

const findPlayerParticipant = (items, playerId, legacyName, allowLegacyName) => {
  if (!Array.isArray(items)) return null;
  const byId = items.find((item) => getEmbeddedPlayerId(item) === playerId);
  if (byId || !allowLegacyName) return byId || null;
  const expectedName = playerNameKey(legacyName);
  return items.find((item) => !getEmbeddedPlayerId(item) && playerNameKey(getNameSnapshot(item)) === expectedName) || null;
};

// GET /api/players/:id
exports.getPlayer = async (req, res) => {
  try {
    const player = await Player.findById(req.params.id).lean();
    if (!player) return res.status(404).json({ success: false, message: "Player not found" });

    const playerId = normalizePlayerId(player._id);
    const exactName = normalizePlayerName(player.name);
    const sameNamePlayers = await Player.find({
      name: new RegExp(`^${escapeRegExp(exactName)}$`, "i"),
    }).select("_id").lean();
    const allowLegacyName = sameNamePlayers.length === 1 &&
      normalizePlayerId(sameNamePlayers[0]._id) === playerId;

    const manOfMatchConditions = [
      { "statistics.manOfTheMatch.playerId": playerId },
      { "statistics.manOfTheMatch._id": playerId },
    ];
    if (allowLegacyName) {
      manOfMatchConditions.push({
        $and: [
          { "statistics.manOfTheMatch.playerId": { $in: ["", null] } },
          { $or: [
            { "statistics.manOfTheMatch.name": exactName },
            { "statistics.manOfTheMatch.nameSnapshot": exactName },
          ] },
        ],
      });
    }

    const [manOfMatch, matches] = await Promise.all([
      Match.countDocuments({ $or: manOfMatchConditions }),
      Match.find({
        status: "completed",
        $or: buildPlayerMatchConditions(playerId, exactName, allowLegacyName),
      }).populate("tournament", "name").lean(),
    ]);

    const batByTourney = {};
    const bwlByTourney = {};

    const initBat = () => ({ matches: 0, innings: 0, notOuts: 0, runs: 0, highestScore: 0, average: 0, strikeRate: 0, hundreds: 0, fifties: 0, fours: 0, sixes: 0 });
    const initBwl = () => ({ matches: 0, innings: 0, wickets: 0, runs: 0, balls: 0, bestFigures: "0/0", average: 0, economy: 0, strikeRate: 0, fiveWickets: 0, maidens: 0 });

    const compareBestFigures = (oldStr, newWickets, newRuns) => {
      if (!oldStr || oldStr === "0/0" || oldStr === "—") return `${newWickets}/${newRuns}`;
      const [oldW, oldR] = oldStr.split("/").map(Number);
      if (newWickets > oldW) return `${newWickets}/${newRuns}`;
      if (newWickets === oldW && newRuns < oldR) return `${newWickets}/${newRuns}`;
      return oldStr;
    };

    matches.forEach(m => {
      const tName = m.tournament ? m.tournament.name : "Other";
      if (!batByTourney[tName]) batByTourney[tName] = initBat();
      if (!bwlByTourney[tName]) bwlByTourney[tName] = initBwl();
      
      batByTourney[tName].matches++;
      bwlByTourney[tName].matches++;

      const processBat = (inn) => {
        if (!inn || !Array.isArray(inn.batsmen)) return;
        const b = findPlayerParticipant(inn.batsmen, playerId, exactName, allowLegacyName);
        if (b) {
          const st = batByTourney[tName];
          st.innings++;
          st.runs += (b.runs || 0);
          st.balls += (b.balls || 0);
          st.fours += (b.fours || 0);
          st.sixes += (b.sixes || 0);
          st.highestScore = Math.max(st.highestScore, b.runs || 0);
          if ((b.runs || 0) >= 100) st.hundreds++;
          else if ((b.runs || 0) >= 50) st.fifties++;
          if (!b.isOut) st.notOuts++;
        }
      };

      const processBwl = (inn) => {
        if (!inn || !Array.isArray(inn.bowlers)) return;
        const bw = findPlayerParticipant(inn.bowlers, playerId, exactName, allowLegacyName);
        if (bw) {
          const st = bwlByTourney[tName];
          st.innings++;
          st.wickets += (bw.wickets || 0);
          st.runs += (bw.runs || 0);
          st.balls += (bw.balls || 0);
          st.maidens += (bw.maidens || 0);
          if ((bw.wickets || 0) >= 5) st.fiveWickets++;
          st.bestFigures = compareBestFigures(st.bestFigures, bw.wickets || 0, bw.runs || 0);
        }
      };

      processBat(m.innings1); processBat(m.innings2);
      processBwl(m.innings1); processBwl(m.innings2);
    });

    const calcRates = (bat, bowl) => {
      const batOuts = bat.innings - bat.notOuts;
      bat.average = batOuts > 0 ? parseFloat((bat.runs / batOuts).toFixed(2)) : (bat.innings > 0 ? bat.runs : 0);
      bat.strikeRate = bat.balls > 0 ? parseFloat(((bat.runs / bat.balls) * 100).toFixed(2)) : 0;
      
      bowl.average = bowl.wickets > 0 ? parseFloat((bowl.runs / bowl.wickets).toFixed(2)) : 0;
      bowl.strikeRate = bowl.wickets > 0 ? parseFloat((bowl.balls / bowl.wickets).toFixed(2)) : 0;
      bowl.economy = bowl.balls > 0 ? parseFloat((bowl.runs / (bowl.balls / 6)).toFixed(2)) : 0;
    };

    Object.values(batByTourney).forEach(bat => calcRates(bat, {}));
    Object.values(bwlByTourney).forEach(bowl => calcRates({innings:0,notOuts:0,runs:0,balls:0}, bowl));

    res.json({ success: true, player: { ...player, playerId, manOfMatch, battingByTournament: batByTourney, bowlingByTournament: bwlByTourney } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/players (admin)
exports.createPlayer = async (req, res) => {
  try {
    const player = await Player.create(pick(req.body, WRITABLE_PLAYER_FIELDS));
    res.status(201).json({ success: true, player });
  } catch (err) {
    const status = validationStatus(err);
    res.status(status).json({ success: false, message: status === 500 ? "Unable to create player" : err.message });
  }
};

// PUT /api/players/:id (admin)
exports.updatePlayer = async (req, res) => {
  try {
    const updateData = pick(req.body, WRITABLE_PLAYER_FIELDS);

    const player = await Player.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
    if (!player) return res.status(404).json({ success: false, message: "Player not found" });
    res.json({ success: true, player });
  } catch (err) {
    const status = validationStatus(err);
    res.status(status).json({ success: false, message: status === 500 ? "Unable to update player" : err.message });
  }
};

// DELETE /api/players/:id (admin)
exports.deletePlayer = async (req, res) => {
  try {
    await Player.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Player deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/players/rankings/batting?format=t20&limit=10
exports.getBattingRankings = async (req, res) => {
  try {
    const players = await getPointsRankings(req.query);
    res.json({ success: true, players });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/players/rankings/bowling?format=t20&limit=10
exports.getBowlingRankings = async (req, res) => {
  try {
    const players = await getPointsRankings(req.query);
    res.json({ success: true, players });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/players/rankings/allrounder?format=t20&limit=10
exports.getAllRounderRankings = async (req, res) => {
  try {
    const players = await getPointsRankings(req.query);
    res.json({ success: true, players });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/players/rankings/points?format=t20&limit=20
exports.getPointsRankings = async (req, res) => {
  try {
    const players = await getPointsRankings(req.query);
    res.json({ success: true, players });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Rebuild career and format-specific stats for all players from completed matches
exports.rebuildAllPlayerStats = async () => {
  try {
    const players = await Player.find({});
    const matches = await Match.find({ status: "completed" }).lean();

    const playerStatsMap = {};
    const playerDirectory = createPlayerDirectory(players);
    const normalizeFormat = (fmt) => {
      const value = String(fmt || "").trim().toUpperCase();
      if (!value) return "T20";
      if (value === "T20I") return "T20";
      if (value === "TEST") return "Test";
      if (value === "CHAMPIONSHIP") return "Championship";
      if (value === "RMC") return "RMC";
      if (value === "T8") return "T8";
      if (value === "T10") return "T10";
      if (value === "T20") return "T20";
      return value;
    };

    const initFormatBatting = () => ({ matches: 0, innings: 0, notOuts: 0, runs: 0, highestScore: 0, average: 0, strikeRate: 0, hundreds: 0, fifties: 0, fours: 0, sixes: 0 });
    const initFormatBowling = () => ({ matches: 0, innings: 0, wickets: 0, runs: 0, balls: 0, bestFigures: "0/0", average: 0, economy: 0, strikeRate: 0, fiveWickets: 0, maidens: 0 });

    const ensurePlayerStats = (participant) => {
      const identity = resolveEmbeddedPlayer(participant, playerDirectory);
      const existing = identity?.player;
      const key = normalizePlayerId(identity?.playerId);
      // Career documents can only be credited to an existing Player. Unknown
      // IDs and ambiguous legacy names remain unassigned until migration.
      if (!key || !existing) return null;
      if (!playerStatsMap[key]) {
        const baseBat = existing?.baseBatting || {};
        const baseBwl = existing?.baseBowling || {};
        playerStatsMap[key] = {
          batting: {
            matches: baseBat.matches || 0, innings: baseBat.innings || 0, notOuts: baseBat.notOuts || 0, runs: baseBat.runs || 0,
            highestScore: baseBat.highestScore || 0, average: baseBat.average || 0, strikeRate: baseBat.strikeRate || 0,
            hundreds: baseBat.hundreds || 0, fifties: baseBat.fifties || 0, fours: baseBat.fours || 0, sixes: baseBat.sixes || 0
          },
          bowling: {
            matches: baseBwl.matches || 0, innings: baseBwl.innings || 0, wickets: baseBwl.wickets || 0, runs: baseBwl.runs || 0,
            balls: baseBwl.balls || 0, bestFigures: baseBwl.bestFigures || "0/0", average: baseBwl.average || 0,
            economy: baseBwl.economy || 0, strikeRate: baseBwl.strikeRate || 0, fiveWickets: baseBwl.fiveWickets || 0, maidens: baseBwl.maidens || 0
          },
          battingByFormat: new Map(),
          bowlingByFormat: new Map()
        };
      }
      return playerStatsMap[key];
    };

    const compareBestFigures = (oldStr, newWickets, newRuns) => {
      if (!oldStr || oldStr === "0/0" || oldStr === "—") return `${newWickets}/${newRuns}`;
      const [oldW, oldR] = oldStr.split("/").map(Number);
      if (newWickets > oldW) return `${newWickets}/${newRuns}`;
      if (newWickets === oldW && newRuns < oldR) return `${newWickets}/${newRuns}`;
      return oldStr;
    };

    const calcRatesAndAverages = (bat, bowl) => {
      const batOuts = (bat?.innings || 0) - (bat?.notOuts || 0);
      if (batOuts > 0) bat.average = Number(((bat.runs || 0) / batOuts).toFixed(2));
      else if ((bat?.innings || 0) > 0) bat.average = Number((bat.runs || 0));
      else bat.average = 0;
      if ((bat?.balls || 0) > 0) bat.strikeRate = Number((((bat.runs || 0) / bat.balls) * 100).toFixed(2));
      else bat.strikeRate = 0;
      if ((bowl?.wickets || 0) > 0) {
        bowl.average = Number(((bowl.runs || 0) / bowl.wickets).toFixed(2));
        bowl.strikeRate = Number(((bowl.balls || 0) / bowl.wickets).toFixed(2));
      } else {
        bowl.average = 0;
        bowl.strikeRate = 0;
      }
      if ((bowl?.balls || 0) > 0) bowl.economy = Number(((bowl.runs || 0) / (bowl.balls / 6)).toFixed(2));
      else bowl.economy = 0;
    };

    for (const match of matches) {
      const format = normalizeFormat(match.format);
      const actualBatters = new Set();
      const actualBowlers = new Set();
      const playerMatchParticipation = new Map(); // Track which players participated in THIS match
      
      // Collect actual participants (players who actually batted or bowled)
      const addFromList = (items, targetSet) => {
        if (!Array.isArray(items)) return;
        items.forEach((entry) => {
          const identity = resolveEmbeddedPlayer(entry, playerDirectory);
          if (!identity?.player) return;
          targetSet.add(identity.playerId);
        });
      };
      
      addFromList(match.innings1?.batsmen, actualBatters);
      addFromList(match.innings1?.bowlers, actualBowlers);
      addFromList(match.innings2?.batsmen, actualBatters);
      addFromList(match.innings2?.bowlers, actualBowlers);
      
      // Track all match participants (batters OR bowlers)
      actualBatters.forEach((playerId) => playerMatchParticipation.set(playerId, true));
      actualBowlers.forEach((playerId) => playerMatchParticipation.set(playerId, true));

      // Initialize format maps for all participants
      playerMatchParticipation.forEach((_, playerId) => {
        const pStats = ensurePlayerStats({ playerId });
        if (!pStats) return;
        if (!pStats.battingByFormat.has(format)) pStats.battingByFormat.set(format, initFormatBatting());
        if (!pStats.bowlingByFormat.has(format)) pStats.bowlingByFormat.set(format, initFormatBowling());
      });

      // Increment match count ONCE per player per match
      playerMatchParticipation.forEach((_, playerId) => {
        const pStats = ensurePlayerStats({ playerId });
        if (!pStats) return;
        pStats.batting.matches += 1;
        pStats.bowling.matches += 1;
        pStats.battingByFormat.get(format).matches += 1;
        pStats.bowlingByFormat.get(format).matches += 1;
      });

      const applyBatting = (inn) => {
        if (!inn || !Array.isArray(inn.batsmen)) return;
        inn.batsmen.forEach((b) => {
          const pStats = ensurePlayerStats(b);
          if (!pStats) return;
          if (!pStats.battingByFormat.has(format)) pStats.battingByFormat.set(format, initFormatBatting());
          const cBat = pStats.batting;
          const fBat = pStats.battingByFormat.get(format);
          const runs = Number(b.runs || 0);
          const balls = Number(b.balls || 0);
          const fours = Number(b.fours || 0);
          const sixes = Number(b.sixes || 0);
          // DO NOT increment matches here - it's done once per player per match above
          fBat.innings += 1;
          fBat.runs += runs;
          fBat.balls += balls;
          fBat.fours += fours;
          fBat.sixes += sixes;
          fBat.highestScore = Math.max(fBat.highestScore || 0, runs);
          if (runs >= 100) fBat.hundreds += 1;
          else if (runs >= 50) fBat.fifties += 1;
          if (!b.isOut) fBat.notOuts += 1;
          // DO NOT increment batting.matches here - see note above
          cBat.innings += 1;
          cBat.runs += runs;
          cBat.balls += balls;
          cBat.fours += fours;
          cBat.sixes += sixes;
          cBat.highestScore = Math.max(cBat.highestScore || 0, runs);
          if (runs >= 100) cBat.hundreds += 1;
          else if (runs >= 50) cBat.fifties += 1;
          if (!b.isOut) cBat.notOuts += 1;
        });
      };

      const applyBowling = (inn) => {
        if (!inn || !Array.isArray(inn.bowlers)) return;
        inn.bowlers.forEach((bw) => {
          const pStats = ensurePlayerStats(bw);
          if (!pStats) return;
          if (!pStats.bowlingByFormat.has(format)) pStats.bowlingByFormat.set(format, initFormatBowling());
          const cBowl = pStats.bowling;
          const fBowl = pStats.bowlingByFormat.get(format);
          const wickets = Number(bw.wickets || 0);
          const runs = Number(bw.runs || 0);
          const balls = Number(bw.balls || 0);
          const maidens = Number(bw.maidens || 0);
          // DO NOT increment matches here - it's done once per player per match above
          fBowl.innings += 1;
          fBowl.wickets += wickets;
          fBowl.runs += runs;
          fBowl.balls += balls;
          fBowl.maidens += maidens;
          if (wickets >= 5) fBowl.fiveWickets += 1;
          fBowl.bestFigures = compareBestFigures(fBowl.bestFigures, wickets, runs);
          // DO NOT increment bowling.matches here - see note above
          cBowl.innings += 1;
          cBowl.wickets += wickets;
          cBowl.runs += runs;
          cBowl.balls += balls;
          cBowl.maidens += maidens;
          if (wickets >= 5) cBowl.fiveWickets += 1;
          cBowl.bestFigures = compareBestFigures(cBowl.bestFigures, wickets, runs);
        });
      };

      applyBatting(match.innings1);
      applyBatting(match.innings2);
      applyBowling(match.innings1);
      applyBowling(match.innings2);
    }

    for (const player of players) {
      const stats = ensurePlayerStats({ playerId: player._id, nameSnapshot: player.name });
      if (!stats) continue;
      calcRatesAndAverages(stats.batting, stats.bowling);
      stats.battingByFormat.forEach((val) => calcRatesAndAverages(val, { wickets: 0, runs: 0, balls: 0, average: 0, strikeRate: 0, economy: 0 }));
      stats.bowlingByFormat.forEach((val) => calcRatesAndAverages({ innings: 0, notOuts: 0, runs: 0, balls: 0, average: 0, strikeRate: 0 }, val));
      player.batting = stats.batting;
      player.bowling = stats.bowling;
      player.battingByFormat = Object.fromEntries(stats.battingByFormat.entries());
      player.bowlingByFormat = Object.fromEntries(stats.bowlingByFormat.entries());
      await player.save();
    }

    console.log(`Successfully rebuilt stats for ${players.length} players!`);
    return true;
  } catch (error) {
    console.error("rebuildAllPlayerStats failed:", error);
    return false;
  }
};

exports._test = {
  aggregatePointsFromMatches,
  buildPlayerMatchConditions,
  createPlayerDirectory,
  extractPlayerStatsFromMatch,
  findPlayerParticipant,
  resolveEmbeddedPlayer,
};
