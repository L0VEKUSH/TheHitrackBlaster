// src/pages/TeamsPage.jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { teamAPI } from "../services/api";
import Spinner from "../components/common/Spinner";
import { EmptyState, PageHeader } from "../components/common/Spinner";

const TYPES = ["All", "Teams", "domestic", "Tournament Teams"];

export default function TeamsPage() {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState("All");
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    const params = {};
    if (type !== "All") params.teamType = type;
    if (search) params.search = search;
    teamAPI.getAll(params)
      .then(({ data }) => setTeams(data.teams || []))
      .finally(() => setLoading(false));
  }, [type, search]);

  return (
    <>
      <PageHeader title="Teams" sub="Teams, domestic and Tournament Teams teams" />
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex flex-wrap gap-3 mb-6">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search teams…" className="input max-w-xs" />
          <div className="flex gap-2 flex-wrap">
            {TYPES.map(t => (
              <button key={t} onClick={() => setType(t)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${type === t ? "bg-brand-500 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
                  }`}>{t}</button>
            ))}
          </div>
        </div>

        {loading ? <Spinner /> : teams.length === 0
          ? <EmptyState icon="👥" title="No teams found" sub="Admin can add teams from the admin panel" />
          : <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {teams.map(t => (
              <Link key={t._id} to={`/teams/${t._id}`}
                className="card p-4 hover:border-brand-600 transition-colors text-center"
              >
                {t.flag || t.logo
                  ? <img src={t.flag || t.logo} alt={t.name}
                    className="w-14 h-10 object-contain mx-auto mb-3" />
                  : <div className="text-4xl mb-3">🏳️</div>
                }
                <h3 className="text-white font-bold text-sm">{t.name}</h3>
                {t.shortName && <p className="text-gray-500 text-xs mt-0.5">{t.shortName}</p>}
                <div className="mt-2 text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full inline-block capitalize">
                  {t.teamType}
                </div>
                {t.rankings?.t20Rank > 0 && (
                  <p className="text-brand-400 text-xs mt-2">T20 Rank #{t.rankings.t20Rank}</p>
                )}
              </Link>
            ))}
          </div>
        }
      </div>
    </>
  );
}
