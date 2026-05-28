// src/pages/admin/AdminTeams.jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { teamAPI } from "../../services/api";
import Spinner from "../../components/common/Spinner";

export default function AdminTeams() {
  const [teams,   setTeams]   = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    teamAPI.getAll().then(({ data }) => setTeams(data.teams || [])).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const remove = async (id) => {
    if (!confirm("Delete this team?")) return;
    await teamAPI.remove(id); load();
  };

  return (
    <div className="space-y-10 pb-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-white uppercase italic tracking-tighter">Team <span className="text-brand-500">Database</span></h1>
          <p className="text-gray-500 text-[10px] font-black uppercase tracking-[0.3em] mt-2">Managing the Teams</p>
        </div>
        <Link to="/admin/teams/new" className="h-14 px-10 rounded-2xl bg-brand-500 text-white text-xs font-black uppercase tracking-widest shadow-glow-orange hover:scale-105 transition-all flex items-center justify-center">
          + Add Team
          
        </Link>
      </div>

      {loading ? <Spinner /> : (
        <div className="card overflow-hidden border-white/5 bg-gray-900/40">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/5 bg-black/20">
                  <th className="py-6 px-8 text-[10px] font-black text-gray-500 uppercase tracking-widest">Team</th>
                  <th className="py-6 px-8 text-[10px] font-black text-gray-500 uppercase tracking-widest">Commanding Officer</th>
                  <th className="py-6 px-8 text-[10px] font-black text-gray-500 uppercase tracking-widest">Other Sports</th>
                  <th className="py-6 px-8 text-[10px] font-black text-gray-500 uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {teams.length === 0 && (
                  <tr><td colSpan={3} className="py-20 text-center text-gray-600 font-bold uppercase text-[10px] tracking-widest">No Teams identified.</td></tr>
                )}
                {teams.map(t => (
                  <tr key={t._id} className="group hover:bg-white/[0.02] transition-colors">
                    <td className="py-6 px-8">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-10 rounded-lg overflow-hidden border border-white/10 group-hover:border-brand-500 transition-colors shadow-lg bg-black/40 flex items-center justify-center p-1">
                          {t.flag || t.logo 
                            ? <img src={t.flag || t.logo} alt={t.name} className="w-full h-full object-contain"/> 
                            : <div className="text-xl">🏳️</div>}
                        </div>
                        <div className="flex flex-col">
                           <span className="text-sm font-black text-white uppercase italic tracking-tight group-hover:text-brand-400 transition-colors">{t.name}</span>
                           <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{t.shortName || "NO-ID"}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-6 px-8">
                       <span className="text-[10px] font-black text-gray-300 uppercase italic tracking-tighter">{t.captain || "UNASSIGNED"}</span>
                    </td>
                    <td className="py-6 px-8 text-sm text-gray-300 space-y-1">
                      {t.otherSportRankings?.length > 0 ? (
                        t.otherSportRankings.map((entry, idx) => (
                          <div key={`${t._id}-${entry.sport}-${idx}`} className="inline-flex flex-wrap gap-2 items-center rounded-lg bg-white/5 px-3 py-2">
                            <span className="font-semibold text-white">{entry.sport || "Sport"}</span>
                            <span className="text-xs text-gray-400">#{entry.rank || 0}</span>
                          </div>
                        ))
                      ) : (
                        <span className="text-gray-600">None</span>
                      )}
                    </td>
                    <td className="py-6 px-8">
                      <div className="flex items-center justify-end gap-3">
                        <Link to={`/admin/teams/${t._id}/edit`}
                          className="h-10 px-5 rounded-xl bg-white/5 text-gray-400 text-[10px] font-black uppercase hover:text-white hover:bg-white/10 transition-all flex items-center">
                          modify
                        </Link>
                        <button onClick={() => remove(t._id)}
                          className="w-10 h-10 rounded-xl bg-white/5 text-gray-600 hover:text-red-500 hover:bg-red-500/10 transition-all flex items-center justify-center">
                          ×
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
