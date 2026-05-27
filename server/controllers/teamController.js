// server/controllers/teamController.js
const { Team } = require("../models/other");
const Match = require("../models/Match");

const getTeamRankings = async ({ format = "T20I", limit = 20 }) => {
  const query = { status: "completed" };
  if (format) query.format = format.toUpperCase();
  const matches = await Match.find(query).lean();
  console.log(`[RANKINGS] Found ${matches.length} completed matches for format=${format}, query=${JSON.stringify(query)}`);
  const agg = {};

  const ensure = (name) => {
    if (!name) return null;
    if (!agg[name]) agg[name] = { name, matches: 0, wins: 0, ties: 0, losses: 0, runsFor: 0, runsAgainst: 0, points: 0 };
    return agg[name];
  };

  matches.forEach((match) => {
    const teamA = match.teamA;
    const teamB = match.teamB;
    const runs = {};
    if (match.innings1 && match.innings1.battingTeam) runs[match.innings1.battingTeam] = (runs[match.innings1.battingTeam] || 0) + (match.innings1.runs || 0);
    if (match.innings2 && match.innings2.battingTeam) runs[match.innings2.battingTeam] = (runs[match.innings2.battingTeam] || 0) + (match.innings2.runs || 0);

    const runsA = runs[teamA] || 0;
    const runsB = runs[teamB] || 0;

    const a = ensure(teamA);
    const b = ensure(teamB);
    if (!a || !b) return;

    a.matches += 1;
    b.matches += 1;
    a.runsFor += runsA;
    a.runsAgainst += runsB;
    b.runsFor += runsB;
    b.runsAgainst += runsA;

    if (runsA > runsB) {
      a.wins += 1; b.losses += 1;
      a.points += 3;
      const diff = runsA - runsB;
      if (diff >= 100) a.points += 2; else if (diff >= 50) a.points += 1;
    } else if (runsB > runsA) {
      b.wins += 1; a.losses += 1;
      b.points += 3;
      const diff = runsB - runsA;
      if (diff >= 100) b.points += 2; else if (diff >= 50) b.points += 1;
    } else {
      // tie / no result
      a.ties += 1; b.ties += 1;
      a.points += 1; b.points += 1;
    }
  });

  const teams = Object.values(agg).map((t) => ({
    ...t,
    netRuns: t.runsFor - t.runsAgainst
  }));

  teams.sort((x, y) => y.points - x.points || y.wins - x.wins || y.netRuns - x.netRuns || y.runsFor - x.runsFor);
  const top = teams.slice(0, Number(limit));
  const names = top.map(t => t.name);
  const details = await Team.find({ name: { $in: names } }).lean();
  const map = new Map(details.map(d => [d.name, d]));

  return top.map(t => ({
    ...t,
    _id: map.get(t.name)?._id || null,
    logo: map.get(t.name)?.logo || map.get(t.name)?.flag || ""
  }));
};

exports.getTeamRankings = async (req, res) => {
  try {
    const teams = await getTeamRankings(req.query);
    res.json({ success: true, teams });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getTeams = async (req, res) => {
  try {
    const { teamType, search } = req.query;
    const query = {};
    if (teamType) query.teamType = teamType;
    if (search)   query.name    = new RegExp(search, "i");
    const teams = await Team.find(query).sort({ name: 1 }).lean();
    res.json({ success: true, teams });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getTeam = async (req, res) => {
  try {
    const team = await Team.findById(req.params.id)
      .populate("players", "name role photo batting.runs bowling.wickets")
      .lean();
    if (!team) return res.status(404).json({ success: false, message: "Team not found" });
    res.json({ success: true, team });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.createTeam = async (req, res) => {
  try {
    const team = await Team.create(req.body);
    res.status(201).json({ success: true, team });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.updateTeam = async (req, res) => {
  try {
    const team = await Team.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!team) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, team });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.deleteTeam = async (req, res) => {
  try {
    await Team.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Deleted" });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
