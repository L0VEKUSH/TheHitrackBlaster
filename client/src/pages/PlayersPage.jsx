// src/pages/PlayersPage.jsx
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { playerAPI } from "../services/api";
import Spinner from "../components/common/Spinner";
import { EmptyState, PageHeader } from "../components/common/Spinner";
import { getImageUrl } from "../utils/imageUtils";

const ROLES = ["All","Batsman","Bowler","All-Rounder","Wicket-Keeper"];

export default function PlayersPage() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [role,    setRole]    = useState("All");
  const [search,  setSearch]  = useState("");

  useEffect(() => {
    setLoading(true);
    const params = { limit: 40 };
    if (role !== "All") params.role = role;
    if (search) params.search = search;
    playerAPI.getAll(params)
      .then(({ data }) => setPlayers(data.players || []))
      .finally(() => setLoading(false));
  }, [role, search]);

  return (
    <>
      <PageHeader title="Players" sub="Cricket player profiles and statistics" />
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search players…"
            className="input max-w-xs"
          />
          <div className="flex gap-2 flex-wrap">
            {ROLES.map(r => (
              <button key={r} onClick={() => setRole(r)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  role === r
                    ? "bg-brand-500 text-white"
                    : "bg-gray-800 text-gray-400 hover:text-white"
                }`}
              >{r}</button>
            ))}
          </div>
        </div>

        {loading ? <Spinner /> : players.length === 0
          ? <EmptyState icon="🧑" title="No players found" sub="Admin can add players from the admin panel" />
          : <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {players.map(p => (
                <Link key={p._id} to={`/players/${p._id}`}
                  className="card p-4 hover:border-brand-600 transition-colors flex flex-col items-center text-center"
                >
                  {p.photo
                    ? <img
                        src={getImageUrl(p.photo)}
                        alt={p.name}
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = getImageUrl(null);
                        }}
                        className="w-16 h-16 rounded-full object-cover mb-3 border-2 border-gray-700"
                      />
                    : <div className="w-16 h-16 rounded-full bg-brand-800 flex items-center justify-center mb-3 text-2xl">🧑</div>
                  }
                  <h3 className="text-white font-bold text-sm">
                    {p.name}
                    {p.isCaptain && <span className="ml-1 text-brand-400" title="Captain"> (C)</span>}
                    {p.isViceCaptain && <span className="ml-1 text-gray-400" title="Vice-Captain"> (VC)</span>}
                  </h3>
                  <span className="mt-2 text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full">{p.role}</span>
                  <div className="mt-3 grid grid-cols-2 gap-x-4 text-xs text-gray-400 w-full">
                    <div><span className="text-white font-bold">{p.batting?.runs || 0}</span><br/>Runs</div>
                    <div><span className="text-white font-bold">{p.bowling?.wickets || 0}</span><br/>Wkts</div>
                  </div>
                </Link>
              ))}
            </div>
        }
      </div>
    </>
  );
}
