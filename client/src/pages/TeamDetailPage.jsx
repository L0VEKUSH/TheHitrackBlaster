// src/pages/TeamDetailPage.jsx
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { teamAPI } from "../services/api";
import Spinner from "../components/common/Spinner";

export default function TeamDetailPage() {
  const { id } = useParams();
  const [team,    setTeam]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    teamAPI.getById(id)
      .then(({ data }) => setTeam(data.team))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Spinner size="lg" />;
  if (!team)   return <div className="text-center py-16 text-gray-400">Team not found</div>;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="card p-6 mb-6">
        <div className="flex items-center gap-5">
          {team.flag || team.logo
            ? <img src={team.flag || team.logo} alt={team.name} className="w-20 h-14 object-contain shrink-0"/>
            : <div className="text-5xl shrink-0">🏳️</div>
          }
          <div>
            <h1 className="text-2xl font-extrabold text-white">{team.name}</h1>
            {team.shortName && <p className="text-brand-400 font-bold text-sm">{team.shortName}</p>}
            <div className="flex gap-3 mt-2 flex-wrap">
              <span className="text-xs bg-gray-700 text-gray-300 px-3 py-1 rounded-full capitalize">{team.teamType}</span>
            </div>
          </div>
        </div>
        {team.description && <p className="text-gray-400 text-sm mt-4 leading-relaxed">{team.description}</p>}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5">
          {[["Captain", team.captain||"—"],["Coach", team.coach||"—"],["Home Ground", team.homeGround||"—"],["Founded", team.founded||"—"]].map(([k,v]) => (
            <div key={k}>
              <div className="text-gray-500 text-xs uppercase tracking-wide">{k}</div>
              <div className="text-white text-sm font-semibold mt-0.5">{v}</div>
            </div>
          ))}
        </div>
        {(team.rankings?.t20Rank || team.rankings?.RMCRank || team.rankings?.testRank) > 0 && (
          <div className="flex gap-4 mt-5 flex-wrap">
            {[["T20I", team.rankings?.t20Rank],["RMC", team.rankings?.RMCRank],["Test", team.rankings?.testRank]]
              .filter(([,v]) => v > 0)
              .map(([f,v]) => (
                <div key={f} className="bg-gray-800 rounded-lg px-4 py-2 text-center">
                  <div className="text-brand-400 text-lg font-extrabold">#{v}</div>
                  <div className="text-gray-400 text-xs">{f} Rank</div>
                </div>
              ))
            }
          </div>
        )}

        {(team.otherSportRankings?.length || 0) > 0 && (
          <div className="mt-6 bg-gray-900 rounded-3xl border border-gray-800 p-5">
            <h2 className="section-title mb-4">Other Sport Rankings</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-400 text-[11px] uppercase tracking-[0.2em]">
                    <th className="py-3 px-4">Sport</th>
                    <th className="py-3 px-4">Rank</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {team.otherSportRankings.map((entry, idx) => (
                    <tr key={`${entry.sport}-${idx}`} className="hover:bg-gray-800/50 transition-colors">
                      <td className="py-3 px-4 text-white">{entry.sport || "Unnamed sport"}</td>
                      <td className="py-3 px-4 text-gray-400">#{entry.rank || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {team.players?.length > 0 && (
        <div className="card p-5">
          <h2 className="section-title mb-4">Squad</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {team.players.map(p => (
              <Link key={p._id} to={`/players/${p._id}`}
                className="flex items-center gap-3 bg-gray-800 rounded-lg p-3 hover:bg-gray-700 transition-colors"
              >
                {p.photo
                  ? <img src={p.photo} alt={p.name} className="w-10 h-10 rounded-full object-cover shrink-0"/>
                  : <div className="w-10 h-10 rounded-full bg-brand-800 flex items-center justify-center text-lg shrink-0">🧑</div>
                }
                <div>
                  <div className="text-white text-sm font-semibold">{p.name}</div>
                  <div className="text-gray-500 text-xs">{p.role}</div>
                </div>
                <div className="ml-auto text-right text-xs text-gray-400">
                  <div>{p.batting?.runs || 0} runs</div>
                  <div>{p.bowling?.wickets || 0} wkts</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
