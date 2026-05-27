// src/pages/TournamentsPage.jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { tournamentAPI } from "../services/api";
import Spinner from "../components/common/Spinner";
import { EmptyState, PageHeader } from "../components/common/Spinner";
import dayjs from "dayjs";

export default function TournamentsPage() {
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    setLoading(true);
    const params = {};
    if (filter === "active")   params.active   = "true";
    if (filter === "featured") params.featured = "true";
    tournamentAPI.getAll(params)
      .then(({ data }) => setTournaments(data.tournaments || []))
      .finally(() => setLoading(false));
  }, [filter]);

  return (
    <>
      <PageHeader title="Series &amp; Tournaments" sub="Ongoing and upcoming cricket series" />
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex gap-2 mb-6">
          {[["all","All"],["active","Active"],["featured","Featured"]].map(([v,l]) => (
            <button key={v} onClick={() => setFilter(v)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === v ? "bg-brand-500 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}>
              {l}
            </button>
          ))}
        </div>
        {loading ? <Spinner /> : tournaments.length === 0
          ? <EmptyState icon="🏆" title="No tournaments yet" sub="Admin can add series from the admin panel" />
          : <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {tournaments.map(t => (
                <Link key={t._id} to={`/tournaments/${t._id}`} className="card p-5 hover:border-brand-600 transition-colors">
                  <div className="flex items-center gap-3 mb-3">
                    {t.logo ? <img src={t.logo} alt={t.name} className="w-10 h-10 object-contain"/> : <div className="text-3xl">🏆</div>}
                    <div>
                      <h3 className="text-white font-bold text-sm">{t.name}</h3>
                      {t.shortName && <p className="text-gray-500 text-xs">{t.shortName}</p>}
                    </div>
                    {t.isActive && <span className="ml-auto text-xs bg-green-800 text-green-300 px-2 py-0.5 rounded">Active</span>}
                  </div>
                  <div className="space-y-1 text-xs text-gray-400">
                    {t.format   && <div>Format: <span className="text-gray-200">{t.format}</span></div>}
                    {t.host     && <div>Host: <span className="text-gray-200">{t.host}</span></div>}
                    {t.startDate && <div>{dayjs(t.startDate).format("D MMM")}{t.endDate ? ` – ${dayjs(t.endDate).format("D MMM YYYY")}` : ""}</div>}
                    {t.teams?.length > 0 && <div>{t.teams.length} teams</div>}
                  </div>
                </Link>
              ))}
            </div>
        }
      </div>
    </>
  );
}
