// src/pages/RankingsPage.jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { playerAPI } from "../services/api";
import Spinner from "../components/common/Spinner";
import { PageHeader } from "../components/common/Spinner";

const FORMATS = [
  { value: "T20", label: "T20" },
  { value: "ODI", label: "ODI" },
  { value: "Test", label: "Test" },
  { value: "T10", label: "T10" },
];

export default function RankingsPage() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [format, setFormat] = useState("T20");

  useEffect(() => {
    setLoading(true);
    playerAPI.pointsRankings({ format, limit: 20 })
      .then(({ data }) => setPlayers(data.players || []))
      .finally(() => setLoading(false));
  }, [format]);

  return (
    <>
      <PageHeader title="Rankings" sub="Official player rankings by match-derived points" />
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex gap-2 mb-6 flex-wrap">
          {FORMATS.map(({ value, label }) => (
            <button key={value} onClick={() => setFormat(value)}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-colors ${format === value ? "bg-brand-500 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="card overflow-hidden">
          {loading ? <Spinner /> : (
            players.length === 0
              ? <p className="text-gray-600 text-sm text-center py-10">No player rankings data. Complete matches are required to generate points rankings.</p>
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
                  <tr key={p._id || p.name} className={`border-b border-gray-800/50 ${i < 3 ? "bg-brand-950/20" : ""}`}>
                    <td className="py-3 px-4">
                      <span className={`font-bold text-base ${i === 0 ? "text-yellow-400" : i === 1 ? "text-gray-300" : i === 2 ? "text-amber-600" : "text-gray-500"}`}>{i + 1}</span>
                    </td>
                    <td className="py-3 px-4">
                      {p._id ? (
                        <Link to={`/players/${p._id}`} className="flex items-center gap-2 group">
                          {p.photo ? <img src={p.photo} alt={p.name} className="w-8 h-8 rounded-full object-cover" /> : <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm">🧑</div>}
                          <span className="text-white font-semibold group-hover:text-brand-400 transition-colors">{p.name}</span>
                        </Link>
                      ) : (
                        <div className="flex items-center gap-2">
                          {p.photo ? <img src={p.photo} alt={p.name} className="w-8 h-8 rounded-full object-cover" /> : <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm">🧑</div>}
                          <span className="text-white font-semibold">{p.name}</span>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-gray-400">{p.team || "Independent"}</td>
                    <td className="py-3 px-4 text-center text-gray-400 font-mono text-xs">{p.points || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
