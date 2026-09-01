// src/pages/admin/AdminMatches.jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { matchAPI } from "../../services/api";
import Spinner from "../../components/common/Spinner";
import { StatusBadge, FormatBadge } from "../../components/common/Spinner";
import dayjs from "dayjs";

export default function AdminMatches() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status,  setStatus]  = useState("all");
  const [error, setError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [deletingId, setDeletingId] = useState("");

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const params = { limit: 50 };
    if (status !== "all") params.status = status;
    matchAPI.getAll(params, { signal: controller.signal })
      .then(({ data }) => {
        if (active) setMatches(Array.isArray(data.matches) ? data.matches : []);
      })
      .catch((loadError) => {
        if (active && loadError.code !== "ERR_CANCELED") {
          setError(loadError.response?.data?.message || loadError.message || "Unable to load matches");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [status, reloadToken]);

  const remove = async (id) => {
    if (deletingId || !window.confirm("Delete this match?")) return;
    setDeletingId(id);
    setError("");
    try {
      await matchAPI.remove(id);
      setMatches((current) => current.filter((match) => match._id !== id));
    } catch (removeError) {
      setError(removeError.response?.data?.message || removeError.message || "Unable to delete match");
    } finally {
      setDeletingId("");
    }
  };

  return (
    <div className="space-y-10 pb-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-white uppercase italic tracking-tighter">Match <span className="text-brand-500">Registry</span></h1>
          <p className="text-gray-500 text-[10px] font-black uppercase tracking-[0.3em] mt-2">Active and Scheduled Matches</p>
        </div>
        <Link to="/admin/matches/new" className="h-14 px-10 rounded-2xl bg-brand-500 text-white text-xs font-black uppercase tracking-widest shadow-glow-orange hover:scale-105 transition-all flex items-center justify-center">
          + New Match
        </Link>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4 custom-scrollbar">
        {["all","live","upcoming","completed"].map(s => (
          <button key={s} onClick={() => setStatus(s)}
            className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              status === s ? "bg-white text-black shadow-xl" : "bg-white/5 text-gray-500 hover:text-white hover:bg-white/10"
            }`}>{s}</button>
        ))}
      </div>

      {error && (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-200">
          <span>{error}. The last successfully loaded list is still shown.</span>
          <button type="button" onClick={() => setReloadToken((token) => token + 1)} className="font-black uppercase tracking-widest hover:text-white">Retry</button>
        </div>
      )}

      {loading ? <Spinner /> : (
        <div className="card overflow-hidden border-white/5 bg-gray-900/40">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/5 bg-black/20">
                  <th className="py-6 px-8 text-[10px] font-black text-gray-500 uppercase tracking-widest">Contestants</th>
                  <th className="py-6 px-8 text-[10px] font-black text-gray-500 uppercase tracking-widest text-center">Format</th>
                  <th className="py-6 px-8 text-[10px] font-black text-gray-500 uppercase tracking-widest">Deployment</th>
                  <th className="py-6 px-8 text-[10px] font-black text-gray-500 uppercase tracking-widest text-center">Status</th>
                  <th className="py-6 px-8 text-[10px] font-black text-gray-500 uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {matches.length === 0 && (
                  <tr><td colSpan={5} className="py-20 text-center text-gray-600 font-bold uppercase text-[10px] tracking-widest">No Matches recorded.</td></tr>
                )}
                {matches.map(m => {
                  return (
                    <tr key={m._id} className="group hover:bg-white/[0.02] transition-colors">
                      <td className="py-6 px-8">
                        <div className="flex flex-col">
                           <span className="text-sm font-black text-white uppercase italic tracking-tight group-hover:text-brand-400 transition-colors">{m.teamA} vs {m.teamB}</span>
                           <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{m.venue || "Location Unspecified"}</span>
                        </div>
                      </td>
                      <td className="py-6 px-8 text-center"><FormatBadge format={m.format} series={m.series} tournament={m.tournament} /></td>
                      <td className="py-6 px-8">
                         <div className="text-[10px] font-mono text-gray-400">
                           {m.matchDate ? dayjs(m.matchDate).format("DD/MM/YYYY") : "TBD"}
                         </div>
                      </td>
                      <td className="py-6 px-8 text-center"><StatusBadge status={m.status} /></td>
                      <td className="py-6 px-8">
                        <div className="flex items-center justify-end gap-3">
                          {m.status === "upcoming" && (
                            <Link to={`/admin/matches/${m._id}/live`}
                              className="h-10 px-5 rounded-xl bg-red-600/10 text-red-500 text-[10px] font-black uppercase hover:bg-red-600 hover:text-white transition-all flex items-center">
                              Start / Toss
                            </Link>
                          )}
                          {m.status === "live" && (
                            <Link to={`/admin/matches/${m._id}/live`}
                              className="h-10 px-5 rounded-xl bg-brand-500 text-white text-[10px] font-black uppercase shadow-glow-orange hover:scale-105 transition-all flex items-center">
                              Score →
                            </Link>
                          )}
                          <Link to={`/admin/matches/${m._id}/edit`}
                            className="h-10 px-5 rounded-xl bg-white/5 text-gray-400 text-[10px] font-black uppercase hover:text-white hover:bg-white/10 transition-all flex items-center">
                            Edit
                          </Link>
                          <button disabled={Boolean(deletingId)} onClick={() => { void remove(m._id); }}
                            className="w-10 h-10 rounded-xl bg-white/5 text-gray-600 hover:text-red-500 hover:bg-red-500/10 transition-all flex items-center justify-center disabled:cursor-not-allowed disabled:opacity-30">
                            ×
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
