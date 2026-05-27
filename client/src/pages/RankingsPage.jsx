// src/pages/RankingsPage.jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { playerAPI, teamAPI } from "../services/api";
import Spinner from "../components/common/Spinner";
import { PageHeader } from "../components/common/Spinner";

export default function RankingsPage() {
  const [players, setPlayers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [view, setView] = useState("players");
  const [loading, setLoading] = useState(true);
  const [format, setFormat] = useState("t20");

  useEffect(() => {
    setLoading(true);
    if (view === "players") {
      playerAPI.pointsRankings({ format, limit: 20 })
        .then(({ data }) => setPlayers(data.players || []))
        .finally(() => setLoading(false));
    } else {
      teamAPI.getRankings({ format, limit: 20 })
        .then(({ data }) => setTeams(data.teams || []))
        .finally(() => setLoading(false));
    }
  }, [format, view]);

  return (
    <>
      <PageHeader title="Rankings" sub="Official player rankings by match-derived points" />
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex gap-2 mb-4 flex-wrap">
          <button onClick={() => setView("players")} className={`px-3 py-1.5 rounded-lg text-sm font-bold ${view === "players" ? "bg-gray-900 text-white" : "bg-gray-800 text-gray-400"}`}>Players</button>
          <button onClick={() => setView("teams")} className={`px-3 py-1.5 rounded-lg text-sm font-bold ${view === "teams" ? "bg-gray-900 text-white" : "bg-gray-800 text-gray-400"}`}>Teams</button>
        </div>
        <div className="flex gap-2 mb-6 flex-wrap">
          {[["t20", "T20I"], ["RMC", "RMC"], ["test", "Test"]].map(([v, l]) => (
            <button key={v} onClick={() => setFormat(v)}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-colors ${format === v ? "bg-brand-500 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="card overflow-hidden">
          {loading ? <Spinner /> : (view === "players" ? (
            players.length === 0
              ? <p className="text-gray-600 text-sm text-center py-10">No player rankings data. Admin can add match performance data to generate points rankings.</p>
              : <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase">
                  <th className="py-2 px-4 text-left">Rank</th>
                  <th className="py-2 px-4 text-left">Player</th>
                  <th className="py-2 px-4 text-left">Team</th>
                  <th className="py-2 px-4 text-center">Points</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p, i) => (
                  <tr key={p.name} className={`border-b border-gray-800/50 ${i < 3 ? "bg-brand-950/20" : ""}`}>
                    <td className="py-3 px-4">
                      <span className={`font-bold text-base ${i === 0 ? "text-yellow-400" : i === 1 ? "text-gray-300" : i === 2 ? "text-amber-600" : "text-gray-500"}`}>{i + 1}</span>
                    </td>
                    <td className="py-3 px-4">
                      <Link to={`/players/${p._id}`} className="flex items-center gap-2 group">
                        {p.photo ? <img src={p.photo} alt={p.name} className="w-8 h-8 rounded-full object-cover" /> : <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm">🧑</div>}
                        <span className="text-white font-semibold group-hover:text-brand-400 transition-colors">{p.name}</span>
                      </Link>
                    </td>
                    <td className="py-3 px-4 text-gray-400">{p.team || "Independent"}</td>
                    <td className="py-3 px-4 text-center text-gray-400 font-mono text-xs">{p.points || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            teams.length === 0
              ? <p className="text-gray-600 text-sm text-center py-10">No team rankings data. Play some completed matches to generate team rankings.</p>
              : <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase">
                    <th className="py-2 px-4 text-left">Rank</th>
                    <th className="py-2 px-4 text-left">Team</th>
                    <th className="py-2 px-4 text-center">Matches</th>
                    <th className="py-2 px-4 text-center">Wins</th>
                    <th className="py-2 px-4 text-center">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((t, i) => (
                    <tr key={t.name} className={`border-b border-gray-800/50 ${i < 3 ? "bg-brand-950/20" : ""}`}>
                      <td className="py-3 px-4"><span className={`font-bold text-base ${i === 0 ? "text-yellow-400" : i === 1 ? "text-gray-300" : i === 2 ? "text-amber-600" : "text-gray-500"}`}>{i + 1}</span></td>
                      <td className="py-3 px-4 flex items-center gap-2">
                        {t.logo ? <img src={t.logo} alt={t.name} className="w-8 h-8 rounded-full object-cover" /> : <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm">🏟️</div>}
                        <span className="text-white font-semibold">{t.name}</span>
                      </td>
                      <td className="py-3 px-4 text-center text-gray-400">{t.matches}</td>
                      <td className="py-3 px-4 text-center text-gray-400">{t.wins}</td>
                      <td className="py-3 px-4 text-center text-gray-400 font-mono text-xs">{t.points || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
          ))}
        </div>
      </div>
    </>
  );
}
