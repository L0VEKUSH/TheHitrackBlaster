// src/pages/PlayerDetailPage.jsx
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { playerAPI, teamAPI } from "../services/api";
import Spinner from "../components/common/Spinner";
import dayjs from "dayjs";

export default function PlayerDetailPage() {
  const { id } = useParams();
  const [player, setPlayer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [teamId, setTeamId] = useState(null);

  useEffect(() => {
    playerAPI.getById(id)
      .then(({ data }) => {
        setPlayer(data.player);
        if (data.player?.team) {
          teamAPI.getAll({ limit: 200 })
            .then(({ data: td }) => {
              const found = (td.teams || []).find(t => t.name === data.player.team);
              if (found) setTeamId(found._id);
            })
            .catch(() => {});
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Spinner size="lg" />;
  if (!player) return <div className="text-center py-16 text-gray-400">Player not found</div>;

  const b  = player.batting  || {};
  const bw = player.bowling  || {};
  const battingByFormat = player.battingByFormat || {};
  const bowlingByFormat = player.bowlingByFormat || {};
  const formatColumns = ["Career", "Test", "RMC", "T20", "IPL"];

  const formatValue = (format, statKey, careerStat) => {
    if (format === "Career") return careerStat[statKey] ?? "—";
    const formatData = battingByFormat[format] || bowlingByFormat[format] || {};
    return formatData[statKey] ?? "—";
  };

  const battingRows = [
    ["Matches",       "matches"],
    ["Innings",       "innings"],
    ["Runs",          "runs"],
    ["Balls",         "balls"],
    ["Highest Score", "highestScore"],
    ["Average",       "average"],
    ["Strike Rate",   "strikeRate"],
    ["Not Outs",      "notOuts"],
    ["Fours",         "fours"],
    ["Sixes",         "sixes"],
    ["50s",           "fifties"],
    ["100s",          "hundreds"],
  ];

  const bowlingRows = [
    ["Matches",      "matches"],
    ["Innings",      "innings"],
    ["Balls",        "balls"],
    ["Runs",         "runs"],
    ["Wickets",      "wickets"],
    ["Maidens",      "maidens"],
    ["Average",      "average"],
    ["Economy",      "economy"],
    ["Strike Rate",  "strikeRate"],
    ["Best Figures", "bestFigures"],
    ["5W Hauls",     "fiveWickets"],
  ];

  const ranks = player.rankings || {};
  const rankingData = [
    { type: "Batting",   t20: ranks.t20Batting,    RMC: ranks.RMCBatting,    test: ranks.testBatting    },
    { type: "Bowling",   t20: ranks.t20Bowling,    RMC: ranks.RMCBowling,    test: ranks.testBowling    },
    { type: "All-Round", t20: ranks.t20AllRounder, RMC: ranks.RMCAllRounder, test: ranks.testAllRounder },
  ].filter(r => r.t20 > 0 || r.RMC > 0 || r.test > 0);

  const mom = player.manOfMatch || 0;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* ── Profile header ─────────────────────────────── */}
      <div className="card p-6 mb-8 border-l-4 border-l-brand-500 bg-gradient-to-br from-gray-900 to-gray-950">
        <div className="flex flex-col md:flex-row gap-8 items-center md:items-start">
          <div className="relative group">
            {player.photo
              ? <img src={player.photo} alt={player.name}
                  className="w-32 h-32 md:w-40 md:h-40 rounded-2xl object-cover border-2 border-brand-500/30 shadow-2xl transition-transform group-hover:scale-105" />
              : <div className="w-32 h-32 md:w-40 md:h-40 rounded-2xl bg-brand-900/50 flex items-center justify-center text-6xl shadow-2xl">🧑</div>
            }
            {player.isCaptain && (
              <div className="absolute -top-2 -right-2 bg-brand-500 text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-lg">CAPTAIN</div>
            )}
          </div>

          <div className="flex-1 text-center md:text-left space-y-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">{player.name}</h1>
            </div>

            <div className="flex flex-wrap gap-3 justify-center md:justify-start">
              <span className="bg-white/10 text-white text-xs font-bold px-4 py-1.5 rounded-full backdrop-blur-md border border-white/5">
                {player.role}
              </span>
              {player.team && (
                teamId
                  ? <Link to={`/teams/${teamId}`}
                      className="bg-brand-500/20 text-brand-400 text-xs font-bold px-4 py-1.5 rounded-full border border-brand-500/30 hover:bg-brand-500/30 transition-colors">
                      {player.team}
                    </Link>
                  : <span className="bg-brand-500/20 text-brand-400 text-xs font-bold px-4 py-1.5 rounded-full border border-brand-500/30">
                      {player.team}
                    </span>
              )}
              {/* MOM badge inline */}
              {mom > 0 && (
                <span className="bg-yellow-500/15 text-yellow-400 text-xs font-bold px-4 py-1.5 rounded-full border border-yellow-500/30 flex items-center gap-1.5">
                  🏆 {mom}× MOM
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 pt-4 border-t border-white/5">
              {[
                ["Batting Style", player.battingStyle || "—"],
                ["Bowling Style", player.bowlingStyle || "—"],
                ["Born", player.dateOfBirth ? dayjs(player.dateOfBirth).format("D MMM YYYY") : "—"],
                ["Age",  player.dateOfBirth ? `${dayjs().diff(dayjs(player.dateOfBirth), "year")} yrs` : "—"],
              ].map(([k, v]) => (
                <div key={k}>
                  <div className="text-gray-500 text-[10px] uppercase font-bold tracking-tighter">{k}</div>
                  <div className="text-white text-sm font-bold mt-1">{v}</div>
                </div>
              ))}
            </div>
            {player.bio && <p className="text-gray-400 text-sm leading-relaxed max-w-2xl italic">"{player.bio}"</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* ── Career summaries ───────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">
          <div className="card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800 bg-gray-900/50">
              <h2 className="text-lg font-black text-white">Batting Career Summary</h2>
            </div>
            <div className="p-6 overflow-x-auto">
              <table className="min-w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className="pb-3 text-xs font-black uppercase tracking-[0.24em] text-gray-500">Stat</th>
                    {formatColumns.map((format) => (
                      <th key={format} className="pb-3 text-xs font-black uppercase tracking-[0.24em] text-gray-500 text-right">
                        {format}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {battingRows.map(([label, key]) => (
                    <tr key={key} className="border-t border-gray-800">
                      <td className="py-3 text-sm text-gray-300">{label}</td>
                      {formatColumns.map((format) => (
                        <td key={format} className="py-3 text-sm text-right text-white">
                          {format === "Career"
                            ? (b[key] ?? "—")
                            : (battingByFormat[format]?.[key] ?? "—")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800 bg-gray-900/50">
              <h2 className="text-lg font-black text-white">Bowling Career Summary</h2>
            </div>
            <div className="p-6 overflow-x-auto">
              <table className="min-w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className="pb-3 text-xs font-black uppercase tracking-[0.24em] text-gray-500">Stat</th>
                    {formatColumns.map((format) => (
                      <th key={format} className="pb-3 text-xs font-black uppercase tracking-[0.24em] text-gray-500 text-right">
                        {format}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bowlingRows.map(([label, key]) => (
                    <tr key={key} className="border-t border-gray-800">
                      <td className="py-3 text-sm text-gray-300">{label}</td>
                      {formatColumns.map((format) => (
                        <td key={format} className="py-3 text-sm text-right text-white">
                          {format === "Career"
                            ? (bw[key] ?? "—")
                            : (bowlingByFormat[format]?.[key] ?? "—")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tournament Stats tables */}
          {player.battingByTournament && Object.keys(player.battingByTournament).length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-800 bg-gray-900/50">
                <h2 className="text-lg font-black text-white">Batting by Tournament</h2>
              </div>
              <div className="p-6 overflow-x-auto">
                <table className="min-w-full text-left border-collapse">
                  <thead>
                    <tr>
                      <th className="pb-3 text-xs font-black uppercase tracking-[0.1em] text-gray-500">Tournament</th>
                      <th className="pb-3 text-xs font-black uppercase tracking-[0.1em] text-gray-500 text-right">M</th>
                      <th className="pb-3 text-xs font-black uppercase tracking-[0.1em] text-gray-500 text-right">I</th>
                      <th className="pb-3 text-xs font-black uppercase tracking-[0.1em] text-gray-500 text-right">Runs</th>
                      <th className="pb-3 text-xs font-black uppercase tracking-[0.1em] text-gray-500 text-right">Balls</th>
                      <th className="pb-3 text-xs font-black uppercase tracking-[0.1em] text-gray-500 text-right">Avg</th>
                      <th className="pb-3 text-xs font-black uppercase tracking-[0.1em] text-gray-500 text-right">SR</th>
                      <th className="pb-3 text-xs font-black uppercase tracking-[0.1em] text-gray-500 text-right">HS</th>
                      <th className="pb-3 text-xs font-black uppercase tracking-[0.1em] text-gray-500 text-right">50s</th>
                      <th className="pb-3 text-xs font-black uppercase tracking-[0.1em] text-gray-500 text-right">100s</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(player.battingByTournament).map(([tName, st]) => (
                      <tr key={tName} className="border-t border-gray-800">
                        <td className="py-3 text-sm text-gray-300 font-bold">{tName}</td>
                        <td className="py-3 text-sm text-right text-white">{st.matches}</td>
                        <td className="py-3 text-sm text-right text-white">{st.innings}</td>
                        <td className="py-3 text-sm text-right text-brand-400 font-black">{st.runs}</td>
                        <td className="py-3 text-sm text-right text-white">{st.balls}</td>
                        <td className="py-3 text-sm text-right text-white">{st.average}</td>
                        <td className="py-3 text-sm text-right text-white">{st.strikeRate}</td>
                        <td className="py-3 text-sm text-right text-white">{st.highestScore}{st.notOuts > 0 && st.highestScore > 0 ? "*" : ""}</td>
                        <td className="py-3 text-sm text-right text-white">{st.fifties}</td>
                        <td className="py-3 text-sm text-right text-white">{st.hundreds}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {player.bowlingByTournament && Object.keys(player.bowlingByTournament).length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-800 bg-gray-900/50">
                <h2 className="text-lg font-black text-white">Bowling by Tournament</h2>
              </div>
              <div className="p-6 overflow-x-auto">
                <table className="min-w-full text-left border-collapse">
                  <thead>
                    <tr>
                      <th className="pb-3 text-xs font-black uppercase tracking-[0.1em] text-gray-500">Tournament</th>
                      <th className="pb-3 text-xs font-black uppercase tracking-[0.1em] text-gray-500 text-right">M</th>
                      <th className="pb-3 text-xs font-black uppercase tracking-[0.1em] text-gray-500 text-right">I</th>
                      <th className="pb-3 text-xs font-black uppercase tracking-[0.1em] text-gray-500 text-right">W</th>
                      <th className="pb-3 text-xs font-black uppercase tracking-[0.1em] text-gray-500 text-right">Runs</th>
                      <th className="pb-3 text-xs font-black uppercase tracking-[0.1em] text-gray-500 text-right">Econ</th>
                      <th className="pb-3 text-xs font-black uppercase tracking-[0.1em] text-gray-500 text-right">Avg</th>
                      <th className="pb-3 text-xs font-black uppercase tracking-[0.1em] text-gray-500 text-right">BBI</th>
                      <th className="pb-3 text-xs font-black uppercase tracking-[0.1em] text-gray-500 text-right">5W</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(player.bowlingByTournament).map(([tName, st]) => (
                      <tr key={tName} className="border-t border-gray-800">
                        <td className="py-3 text-sm text-gray-300 font-bold">{tName}</td>
                        <td className="py-3 text-sm text-right text-white">{st.matches}</td>
                        <td className="py-3 text-sm text-right text-white">{st.innings}</td>
                        <td className="py-3 text-sm text-right text-brand-400 font-black">{st.wickets}</td>
                        <td className="py-3 text-sm text-right text-white">{st.runs}</td>
                        <td className="py-3 text-sm text-right text-white">{st.economy}</td>
                        <td className="py-3 text-sm text-right text-white">{st.average}</td>
                        <td className="py-3 text-sm text-right text-white">{st.bestFigures}</td>
                        <td className="py-3 text-sm text-right text-white">{st.fiveWickets}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ── Sidebar ───────────────────────────────────── */}
        <div className="space-y-6">
          {/* Man of the Match trophy card */}
          <div className="card p-5 bg-gradient-to-br from-yellow-950/40 via-gray-950 to-gray-950 border border-yellow-500/20">
            <div className="text-[10px] font-black text-yellow-500/60 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
              🏆 Awards
            </div>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center text-3xl shrink-0">
                🏆
              </div>
              <div>
                <div className="text-4xl font-black text-yellow-400 leading-none">{mom}</div>
                <div className="text-yellow-600/80 text-[10px] font-black uppercase tracking-widest mt-1">Man of the Match</div>
                <div className="text-gray-600 text-[10px] mt-0.5">{mom === 1 ? "Award" : "Awards"} won</div>
              </div>
            </div>
          </div>

          {/* Rankings */}
          <div className="card p-6 bg-gradient-to-b from-gray-900 to-gray-950 border-t-2 border-brand-500">
            <h3 className="text-lg font-black text-white mb-6 flex items-center gap-2">
              <span className="text-brand-500">★</span> RANKINGS
            </h3>
            <div className="space-y-5">
              {rankingData.length > 0 ? rankingData.map(r => (
                <div key={r.type} className="space-y-3">
                  <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{r.type}</div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[["T20I", r.t20], ["RMC", r.RMC], ["TEST", r.test]].map(([format, rank]) => (
                      <div key={format} className={`p-2 rounded-xl border ${rank > 0 ? "bg-brand-500/5 border-brand-500/20" : "bg-gray-800/20 border-white/5"}`}>
                        <div className="text-[9px] font-bold text-gray-500">{format}</div>
                        <div className={`text-sm font-black ${rank > 0 ? "text-brand-400" : "text-gray-700"}`}>
                          {rank > 0 ? `#${rank}` : "—"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )) : (
                <div className="text-center py-8 text-gray-600 text-sm italic">Not currently ranked in top tiers</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
