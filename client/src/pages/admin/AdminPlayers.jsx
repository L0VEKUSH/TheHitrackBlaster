// src/pages/admin/AdminPlayers.jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { playerAPI } from "../../services/api";
import Spinner from "../../components/common/Spinner";

export default function AdminPlayers() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState("");

  const load = () => {
    setLoading(true);
    const params = { limit: 100 };
    if (search) params.search = search;
    playerAPI.getAll(params)
      .then(({ data }) => setPlayers(data.players || []))
      .finally(() => setLoading(false));
  };

  useEffect(load, [search]);

  const remove = async (id) => {
    if (!confirm("Delete this player?")) return;
    await playerAPI.remove(id); load();
  };

  return (
    <div className="space-y-10 pb-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-white uppercase italic tracking-tighter"> <span className="text-brand-500">Player</span></h1>
          <p className="text-gray-500 text-[10px] font-black uppercase tracking-[0.3em] mt-2">Managing the Elite Players</p>
        </div>
        <Link to="/admin/players/new" className="h-14 px-10 rounded-2xl bg-brand-500 text-white text-xs font-black uppercase tracking-widest shadow-glow-orange hover:scale-105 transition-all flex items-center justify-center">
          + Add Player
        </Link>
      </div>

      <div className="relative group max-w-md">
        <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-gray-500 group-focus-within:text-brand-500 transition-colors">
           <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="SEARCH Players..." 
          className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-6 py-4 text-[10px] font-black uppercase tracking-widest text-white focus:outline-none focus:border-brand-500 transition-all" />
      </div>

      {loading ? <Spinner /> : (
        <div className="card overflow-hidden border-white/5 bg-gray-900/40">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/5 bg-black/20">
                  <th className="py-6 px-8 text-[10px] font-black text-gray-500 uppercase tracking-widest">Athlete</th>
                  <th className="py-6 px-8 text-[10px] font-black text-gray-500 uppercase tracking-widest">Specialization</th>
                  <th className="py-6 px-8 text-[10px] font-black text-gray-500 uppercase tracking-widest text-center">Score</th>
                  <th className="py-6 px-8 text-[10px] font-black text-gray-500 uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {players.length === 0 && (
                  <tr><td colSpan={5} className="py-20 text-center text-gray-600 font-bold uppercase text-[10px] tracking-widest">No athletes enlisted.</td></tr>
                )}
                {players.map(p => (
                  <tr key={p._id} className="group hover:bg-white/[0.02] transition-colors">
                    <td className="py-6 px-8">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white/10 group-hover:border-brand-500 transition-colors shadow-lg">
                          {p.photo
                            ? <img src={p.photo} alt={p.name} className="w-full h-full object-cover"/>
                            : <div className="w-full h-full bg-gray-800 flex items-center justify-center text-xl">🧑</div>
                          }
                        </div>
                        <div className="flex flex-col">
                           <span className="text-sm font-black text-white uppercase italic tracking-tight group-hover:text-brand-400 transition-colors">{p.name}</span>
                           <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{p.team || "Independent"}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-6 px-8">
                      <span className="text-[9px] bg-brand-500/10 text-brand-400 px-3 py-1 rounded-full font-black uppercase tracking-widest border border-brand-500/20">{p.role}</span>
                    </td>
                    <td className="py-6 px-8">
                       <div className="flex flex-col items-center">
                          <span className="text-xs font-black text-white font-mono">{p.batting?.runs || 0} <span className="text-[9px] text-gray-600 uppercase font-sans">Runs</span></span>
                          <span className="text-[9px] text-gray-500 font-bold uppercase tracking-tighter">{p.bowling?.wickets || 0} Wkts</span>
                       </div>
                    </td>
                    <td className="py-6 px-8">
                      <div className="flex items-center justify-end gap-3">
                        <Link to={`/admin/players/${p._id}/edit`}
                          className="h-10 px-5 rounded-xl bg-white/5 text-gray-400 text-[10px] font-black uppercase hover:text-white hover:bg-white/10 transition-all flex items-center">
                          modify
                        </Link>
                        <button onClick={() => remove(p._id)}
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
