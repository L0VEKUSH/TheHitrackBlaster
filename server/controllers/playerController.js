// server/controllers/playerController.js
const Match = require("../models/Match");
const Player = require("../models/Player");
const { pagination, pick, validationStatus } = require("../utils/input");

const WRITABLE_PLAYER_FIELDS = [
  "name", "fullName", "team", "photo", "dateOfBirth", "role",
  "battingStyle", "bowlingStyle", "bio", "isFeatured", "isCaptain", "isViceCaptain",
  "baseBatting", "baseBowling", "rankings",
];

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

const extractPlayerStatsFromMatch = (match) => {
  const players = {};
  const ensure = (name, id = null) => {
    const normalizedName = name ? String(name).trim() : "";
    const key = id ? String(id) : normalizedName;
    if (!key) return null;
    if (!players[key]) {
      players[key] = {
        name: normalizedName || "Unknown",
        _id: id || null,
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
    }
    return players[key];
  };

  const getPlayerKey = (item) => {
    if (!item) return { name: null, id: null };
    const id = item._id || item.playerId || null;
    return { name: item.name, id };
  };

  if (match.statistics && Array.isArray(match.statistics.players) && match.statistics.players.length > 0) {
    match.statistics.players.forEach((p) => {
      const { name, id } = getPlayerKey(p);
      if (!name && !id) return;
      const dest = ensure(name, id);
      if (!dest) return;
      dest.runs += p.runs || 0;
      dest.balls += p.balls || 0;
      dest.fours += p.fours || 0;
      dest.sixes += p.sixes || 0;
      dest.wickets += p.wickets || 0;
      dest.ballsBowled += p.ballsBowled || 0;
      dest.runsConceded += p.runsConceded || 0;
      dest.maidens += p.maidens || 0;
      dest.points += typeof p.points === "number" ? p.points : calculateMatchPoints(p);
    });
    return Object.values(players);
  }

  const ingestInnings = (inn) => {
    if (!inn) return;
    if (Array.isArray(inn.batsmen)) {
      inn.batsmen.forEach((b) => {
        const { name, id } = getPlayerKey(b);
        if (!name && !id) return;
        const dest = ensure(name, id);
        if (!dest) return;
        dest.runs += b.runs || 0;
        dest.balls += b.balls || 0;
        dest.fours += b.fours || 0;
        dest.sixes += b.sixes || 0;
      });
    }
    if (Array.isArray(inn.bowlers)) {
      inn.bowlers.forEach((b) => {
        const { name, id } = getPlayerKey(b);
        if (!name && !id) return;
        const dest = ensure(name, id);
        if (!dest) return;
        dest.wickets += b.wickets || 0;
        dest.ballsBowled += b.balls || 0;
        dest.runsConceded += b.runs || 0;
        dest.maidens += b.maidens || 0;
      });
    }
  };

  ingestInnings(match.innings1);
  ingestInnings(match.innings2);
  return Object.values(players).map((p) => ({ ...p, points: calculateMatchPoints(p) }));
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
  const matches = await Match.find(query).lean();
  const agg = {};

  matches.forEach((match) => {
    const players = extractPlayerStatsFromMatch(match);
    players.forEach((p) => {
      if (!p || !p.name) return;
      const name = p.name.trim();
      if (!name) return;
      const dest = agg[name] || { name, matches: 0, runs: 0, balls: 0, fours: 0, sixes: 0, wickets: 0, ballsBowled: 0, runsConceded: 0, maidens: 0, points: 0 };
      // count this player's appearance in the current match
      dest.matches += 1;
      dest.runs += p.runs || 0;
      dest.balls += p.balls || 0;
      dest.fours += p.fours || 0;
      dest.sixes += p.sixes || 0;
      dest.wickets += p.wickets || 0;
      dest.ballsBowled += p.ballsBowled || 0;
      dest.runsConceded += p.runsConceded || 0;
      dest.maidens += p.maidens || 0;
      dest.points += p.points || 0;
      agg[name] = dest;
    });
  });

  const players = Object.values(agg).map((p) => {
    const strikeRate = p.balls > 0 ? (p.runs / p.balls) * 100 : 0;
    const overs = p.ballsBowled / 6;
    const economy = p.ballsBowled > 0 ? p.runsConceded / overs : null;
    const average = p.wickets > 0 ? p.runs / p.wickets : (p.runs || 0);
    return {
      ...p,
      strikeRate: Math.round(strikeRate),
      economy: economy === null ? null : parseFloat(economy.toFixed(2)),
      average: parseFloat(average.toFixed(2))
    };
  });

  players.sort((a, b) => b.points - a.points || b.wickets - a.wickets || b.runs - a.runs);
  // apply minimum-match filter
  const filtered = players.filter(p => (p.matches || 0) >= minMatchesNum);
  const safeLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 20));
  const topPlayers = filtered.slice(0, safeLimit);

  const ids = topPlayers.filter(p => p._id).map(p => p._id);
  const names = topPlayers.filter(p => !p._id).map(p => p.name);
  const details = await Player.find({
    $or: [
      ...(ids.length > 0 ? [{ _id: { $in: ids } }] : []),
      ...(names.length > 0 ? [{ name: { $in: names } }] : [])
    ]
  }).lean();

  const detailMap = new Map(details.map((p) => [p._id ? String(p._id) : p.name, p]));

  return topPlayers.map((p) => {
    const detailKey = p._id ? String(p._id) : p.name;
    const detail = detailMap.get(detailKey) || {};
    return {
      ...p,
      _id: detail._id || p._id || null,
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

// GET /api/players/:id
exports.getPlayer = async (req, res) => {
  try {
    const player = await Player.findById(req.params.id).lean();
    if (!player) return res.status(404).json({ success: false, message: "Player not found" });

    // Count Man of the Match awards for this player
    const manOfMatch = await Match.countDocuments({
      "statistics.manOfTheMatch.name": player.name
    });

    // Compute Tournament-Level Stats
    const matches = await Match.find({ 
      status: "completed", 
      $or: [
        { "innings1.batsmen.name": player.name },
        { "innings1.bowlers.name": player.name },
        { "innings2.batsmen.name": player.name },
        { "innings2.bowlers.name": player.name },
        { squadA: player.name },
        { squadB: player.name }
      ]
    }).populate("tournament", "name").lean();

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
        const b = inn.batsmen.find(bat => bat.name === player.name);
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
        const bw = inn.bowlers.find(bowl => bowl.name === player.name);
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

    res.json({ success: true, player: { ...player, manOfMatch, battingByTournament: batByTourney, bowlingByTournament: bwlByTourney } });
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

    const ensurePlayerStats = (name) => {
      const key = String(name || "").trim();
      if (!key) return null;
      if (!playerStatsMap[key]) {
        const existing = players.find((p) => String(p.name || "").trim() === key);
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
      const participantNames = new Set();
      const addFromList = (items) => {
        if (!Array.isArray(items)) return;
        items.forEach((entry) => {
          if (!entry || !entry.name) return;
          participantNames.add(String(entry.name).trim());
        });
      };
      addFromList(match.squadA ? match.squadA.map((name) => ({ name })) : []);
      addFromList(match.squadB ? match.squadB.map((name) => ({ name })) : []);
      addFromList(match.innings1?.batsmen);
      addFromList(match.innings1?.bowlers);
      addFromList(match.innings2?.batsmen);
      addFromList(match.innings2?.bowlers);

      participantNames.forEach((pName) => {
        const pStats = ensurePlayerStats(pName);
        if (!pStats) return;

        if (!pStats.battingByFormat.has(format)) pStats.battingByFormat.set(format, initFormatBatting());
        if (!pStats.bowlingByFormat.has(format)) pStats.bowlingByFormat.set(format, initFormatBowling());

        const formatBat = pStats.battingByFormat.get(format);
        const formatBowl = pStats.bowlingByFormat.get(format);
        formatBat.matches += 1;
        formatBowl.matches += 1;
      });

      const applyBatting = (inn) => {
        if (!inn || !Array.isArray(inn.batsmen)) return;
        inn.batsmen.forEach((b) => {
          if (!b || !b.name) return;
          const pStats = ensurePlayerStats(b.name);
          if (!pStats) return;
          if (!pStats.battingByFormat.has(format)) pStats.battingByFormat.set(format, initFormatBatting());
          const cBat = pStats.batting;
          const fBat = pStats.battingByFormat.get(format);
          const runs = Number(b.runs || 0);
          const balls = Number(b.balls || 0);
          const fours = Number(b.fours || 0);
          const sixes = Number(b.sixes || 0);
          cBat.matches += 1;
          fBat.matches += 1;
          fBat.innings += 1;
          fBat.runs += runs;
          fBat.balls += balls;
          fBat.fours += fours;
          fBat.sixes += sixes;
          fBat.highestScore = Math.max(fBat.highestScore || 0, runs);
          if (runs >= 100) fBat.hundreds += 1;
          else if (runs >= 50) fBat.fifties += 1;
          if (!b.isOut) fBat.notOuts += 1;
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
          if (!bw || !bw.name) return;
          const pStats = ensurePlayerStats(bw.name);
          if (!pStats) return;
          if (!pStats.bowlingByFormat.has(format)) pStats.bowlingByFormat.set(format, initFormatBowling());
          const cBowl = pStats.bowling;
          const fBowl = pStats.bowlingByFormat.get(format);
          const wickets = Number(bw.wickets || 0);
          const runs = Number(bw.runs || 0);
          const balls = Number(bw.balls || 0);
          const maidens = Number(bw.maidens || 0);
          cBowl.matches += 1;
          fBowl.matches += 1;
          fBowl.innings += 1;
          fBowl.wickets += wickets;
          fBowl.runs += runs;
          fBowl.balls += balls;
          fBowl.maidens += maidens;
          if (wickets >= 5) fBowl.fiveWickets += 1;
          fBowl.bestFigures = compareBestFigures(fBowl.bestFigures, wickets, runs);
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
      const stats = ensurePlayerStats(player.name);
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
