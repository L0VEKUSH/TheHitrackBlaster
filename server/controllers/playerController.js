// server/controllers/playerController.js
const Match = require("../models/Match");
const Player = require("../models/Player");

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
    const names = req.query.names ? String(req.query.names).split(",").map(n => n.trim()).filter(Boolean) : [];
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
  const ensure = (name) => {
    if (!name) return null;
    const key = name.trim();
    if (!key) return null;
    if (!players[key]) {
      players[key] = { name: key, runs: 0, balls: 0, fours: 0, sixes: 0, wickets: 0, ballsBowled: 0, runsConceded: 0, maidens: 0, points: 0 };
    }
    return players[key];
  };

  if (match.statistics && Array.isArray(match.statistics.players) && match.statistics.players.length > 0) {
    match.statistics.players.forEach((p) => {
      if (!p || !p.name) return;
      const dest = ensure(p.name);
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
        if (!b || !b.name) return;
        const dest = ensure(b.name);
        dest.runs += b.runs || 0;
        dest.balls += b.balls || 0;
        dest.fours += b.fours || 0;
        dest.sixes += b.sixes || 0;
      });
    }
    if (Array.isArray(inn.bowlers)) {
      inn.bowlers.forEach((b) => {
        if (!b || !b.name) return;
        const dest = ensure(b.name);
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

const getPointsRankings = async ({ format = "t20", limit = 20 }) => {
  const query = { status: "completed" };
  if (format) query.format = new RegExp(`^${format}$`, "i");
  const matches = await Match.find(query).lean();
  const agg = {};

  matches.forEach((match) => {
    const players = extractPlayerStatsFromMatch(match);
    players.forEach((p) => {
      if (!p || !p.name) return;
      const name = p.name.trim();
      if (!name) return;
      const dest = agg[name] || { name, runs: 0, balls: 0, fours: 0, sixes: 0, wickets: 0, ballsBowled: 0, runsConceded: 0, maidens: 0, points: 0 };
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
  const topPlayers = players.slice(0, Number(limit));
  const names = topPlayers.map((p) => p.name);
  const details = await Player.find({ name: { $in: names } }).lean();
  const detailMap = new Map(details.map((p) => [p.name, p]));

  return topPlayers.map((p) => {
    const detail = detailMap.get(p.name) || {};
    return {
      ...p,
      _id: detail._id || null,
      team: detail.team || "",
      photo: detail.photo || ""
    };
  });
};

// GET /api/players?role=&search=&page=1
exports.getPlayers = async (req, res) => {
  try {
    const { team, role, search, page = 1, limit = 20, featured } = req.query;
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
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
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
    const player = await Player.create(req.body);
    res.status(201).json({ success: true, player });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/players/:id (admin)
exports.updatePlayer = async (req, res) => {
  try {
    const allowed = [
      "name", "fullName", "team", "photo", "dateOfBirth", "role",
      "battingStyle", "bowlingStyle", "bio", "isFeatured", "isCaptain", "isViceCaptain",
      "baseBatting", "baseBowling", "rankings"
    ];
    const updateData = {};
    Object.keys(req.body).forEach(key => { if (allowed.includes(key)) updateData[key] = req.body[key]; });

    const player = await Player.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
    if (!player) return res.status(404).json({ success: false, message: "Player not found" });
    res.json({ success: true, player });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
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
    players.forEach(p => {
      // Start with base (historical/manual) stats if they exist, otherwise zero
      const baseBat = p.baseBatting || {};
      const baseBwl = p.baseBowling || {};
      
      playerStatsMap[p.name] = {
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
    });

    const initFormatBatting = () => ({ matches: 0, innings: 0, notOuts: 0, runs: 0, highestScore: 0, average: 0, strikeRate: 0, hundreds: 0, fifties: 0, fours: 0, sixes: 0 });
    const initFormatBowling = () => ({ matches: 0, innings: 0, wickets: 0, runs: 0, balls: 0, bestFigures: "0/0", average: 0, economy: 0, strikeRate: 0, fiveWickets: 0, maidens: 0 });

    const getFormatKey = (fmt) => {
      if (!fmt) return "T20";
      const f = fmt.toUpperCase().trim();
      if (f === "T20I") return "T20";
      if (["TEST", "RMC", "T20", "IPL"].includes(f)) {
        if (f === "TEST") return "Test";
        return f;
      }
      return fmt;
    };

    const compareBestFigures = (oldStr, newWickets, newRuns) => {
      if (!oldStr || oldStr === "0/0" || oldStr === "—") return `${newWickets}/${newRuns}`;
      const [oldW, oldR] = oldStr.split("/").map(Number);
      if (newWickets > oldW) return `${newWickets}/${newRuns}`;
      if (newWickets === oldW && newRuns < oldR) return `${newWickets}/${newRuns}`;
      return oldStr;
    };

    for (const match of matches) {
      const format = getFormatKey(match.format);

      const participants = new Set();
      if (Array.isArray(match.squadA)) {
        match.squadA.forEach(name => { if (name) participants.add(name.trim()); });
      }
      if (Array.isArray(match.squadB)) {
        match.squadB.forEach(name => { if (name) participants.add(name.trim()); });
      }

      const addFromInnings = (inn) => {
        if (!inn) return;
        if (Array.isArray(inn.batsmen)) {
          inn.batsmen.forEach(b => { if (b && b.name) participants.add(b.name.trim()); });
        }
        if (Array.isArray(inn.bowlers)) {
          inn.bowlers.forEach(b => { if (b && b.name) participants.add(b.name.trim()); });
        }
      };
      addFromInnings(match.innings1);
      addFromInnings(match.innings2);

      participants.forEach(pName => {
        const pStats = playerStatsMap[pName];
        if (!pStats) return;

        pStats.batting.matches += 1;
        pStats.bowling.matches += 1;

        if (!pStats.battingByFormat.has(format)) pStats.battingByFormat.set(format, initFormatBatting());
        if (!pStats.bowlingByFormat.has(format)) pStats.bowlingByFormat.set(format, initFormatBowling());
        
        pStats.battingByFormat.get(format).matches += 1;
        pStats.bowlingByFormat.get(format).matches += 1;
      });

      const processBattingInnings = (inn) => {
        if (!inn || !Array.isArray(inn.batsmen)) return;
        inn.batsmen.forEach(b => {
          if (!b || !b.name) return;
          const pName = b.name.trim();
          const pStats = playerStatsMap[pName];
          if (!pStats) return;

          if (!pStats.battingByFormat.has(format)) pStats.battingByFormat.set(format, initFormatBatting());

          const cBat = pStats.batting;
          const fBat = pStats.battingByFormat.get(format);

          const r = b.runs || 0;
          const bl = b.balls || 0;
          const f4 = b.fours || 0;
          const s6 = b.sixes || 0;

          [cBat, fBat].forEach(st => {
            st.innings += 1;
            st.runs += r;
            st.balls += bl;
            st.fours += f4;
            st.sixes += s6;
            st.highestScore = Math.max(st.highestScore, r);

            if (r >= 100) st.hundreds += 1;
            else if (r >= 50) st.fifties += 1;

            if (!b.isOut) st.notOuts += 1;
          });
        });
      };

      processBattingInnings(match.innings1);
      processBattingInnings(match.innings2);

      const processBowlingInnings = (inn) => {
        if (!inn || !Array.isArray(inn.bowlers)) return;
        inn.bowlers.forEach(bw => {
          if (!bw || !bw.name) return;
          const pName = bw.name.trim();
          const pStats = playerStatsMap[pName];
          if (!pStats) return;

          if (!pStats.bowlingByFormat.has(format)) pStats.bowlingByFormat.set(format, initFormatBowling());

          const cBowl = pStats.bowling;
          const fBowl = pStats.bowlingByFormat.get(format);

          const w = bw.wickets || 0;
          const rCon = bw.runs || 0;
          const blBwl = bw.balls || 0;
          const m = bw.maidens || 0;

          [cBowl, fBowl].forEach(st => {
            st.innings += 1;
            st.wickets += w;
            st.runs += rCon;
            st.balls += blBwl;
            st.maidens += m;

            if (w >= 5) st.fiveWickets += 1;
            st.bestFigures = compareBestFigures(st.bestFigures, w, rCon);
          });
        });
      };

      processBowlingInnings(match.innings1);
      processBowlingInnings(match.innings2);
    }

    const calcRatesAndAverages = (bat, bowl) => {
      const batOuts = bat.innings - bat.notOuts;
      if (batOuts > 0) {
        bat.average = parseFloat((bat.runs / batOuts).toFixed(2));
      } else if (bat.innings > 0) {
        bat.average = bat.runs;
      } else {
        bat.average = 0;
      }

      if (bat.balls > 0) {
        bat.strikeRate = parseFloat(((bat.runs / bat.balls) * 100).toFixed(2));
      } else {
        bat.strikeRate = 0;
      }

      if (bowl.wickets > 0) {
        bowl.average = parseFloat((bowl.runs / bowl.wickets).toFixed(2));
        bowl.strikeRate = parseFloat((bowl.balls / bowl.wickets).toFixed(2));
      } else {
        bowl.average = 0;
        bowl.strikeRate = 0;
      }

      if (bowl.balls > 0) {
        bowl.economy = parseFloat((bowl.runs / (bowl.balls / 6)).toFixed(2));
      } else {
        bowl.economy = 0;
      }
    };

    for (const player of players) {
      const stats = playerStatsMap[player.name];
      if (!stats) continue;

      calcRatesAndAverages(stats.batting, stats.bowling);

      const battingByFormatObj = {};
      stats.battingByFormat.forEach((val, key) => {
        calcRatesAndAverages(val, { wickets: 0, runs: 0, balls: 0, average: 0, strikeRate: 0, economy: 0 });
        battingByFormatObj[key] = val;
      });

      const bowlingByFormatObj = {};
      stats.bowlingByFormat.forEach((val, key) => {
        calcRatesAndAverages({ innings: 0, notOuts: 0, runs: 0, balls: 0, average: 0, strikeRate: 0 }, val);
        bowlingByFormatObj[key] = val;
      });

      player.batting = stats.batting;
      player.bowling = stats.bowling;
      player.battingByFormat = battingByFormatObj;
      player.bowlingByFormat = bowlingByFormatObj;

      await player.save();
    }

    console.log(`Successfully rebuilt stats for ${players.length} players!`);
    return true;
  } catch (error) {
    console.error("rebuildAllPlayerStats failed:", error);
    return false;
  }
};
