// src/pages/admin/AdminNews.jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { newsAPI } from "../../services/api";
import Spinner from "../../components/common/Spinner";
import dayjs from "dayjs";

export default function AdminNews() {
  const [news,    setNews]    = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    newsAPI.getAll({ limit:100 }).then(({ data }) => setNews(data.news || [])).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const remove = async (id) => {
    if (!confirm("Delete this article?")) return;
    await newsAPI.remove(id); load();
  };

  const toggle = async (n) => {
    await newsAPI.update(n._id, { isPublished: !n.isPublished }); load();
  };

  return (
    <div className="space-y-10 pb-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-white uppercase italic tracking-tighter">Field <span className="text-brand-500">Reports</span></h1>
          <p className="text-gray-500 text-[10px] font-black uppercase tracking-[0.3em] mt-2">Managing Editorial Intelligence</p>
        </div>
        <Link to="/admin/news/new" className="h-14 px-10 rounded-2xl bg-brand-500 text-white text-xs font-black uppercase tracking-widest shadow-glow-orange hover:scale-105 transition-all flex items-center justify-center">
          + Draft Report
        </Link>
      </div>

      {loading ? <Spinner /> : (
        <div className="card overflow-hidden border-white/5 bg-gray-900/40">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/5 bg-black/20">
                  <th className="py-6 px-8 text-[10px] font-black text-gray-500 uppercase tracking-widest">Report Title</th>
                  <th className="py-6 px-8 text-[10px] font-black text-gray-500 uppercase tracking-widest">Classification</th>
                  <th className="py-6 px-8 text-[10px] font-black text-gray-500 uppercase tracking-widest">Deployment Date</th>
                  <th className="py-6 px-8 text-[10px] font-black text-gray-500 uppercase tracking-widest text-center">Status</th>
                  <th className="py-6 px-8 text-[10px] font-black text-gray-500 uppercase tracking-widest text-center">Engagement</th>
                  <th className="py-6 px-8 text-[10px] font-black text-gray-500 uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {news.length === 0 && (
                  <tr><td colSpan={6} className="py-20 text-center text-gray-600 font-bold uppercase text-[10px] tracking-widest">No intelligence reports drafted.</td></tr>
                )}
                {news.map(n => (
                  <tr key={n._id} className="group hover:bg-white/[0.02] transition-colors">
                    <td className="py-6 px-8 max-w-sm">
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-12 rounded-lg overflow-hidden border border-white/10 shrink-0 bg-black/40">
                          {n.image 
                            ? <img src={n.image} alt="" className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all"/> 
                            : <div className="w-full h-full flex items-center justify-center text-lg">📰</div>}
                        </div>
                        <div className="flex flex-col min-w-0">
                           <span className="text-sm font-black text-white uppercase italic tracking-tight group-hover:text-brand-400 transition-colors line-clamp-1">{n.title}</span>
                           <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{n.author || "Hitrack Desk"}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-6 px-8">
                      <span className="text-[9px] bg-brand-500/10 text-brand-400 px-3 py-1 rounded-full font-black uppercase tracking-widest border border-brand-500/20">{n.category}</span>
                    </td>
                    <td className="py-6 px-8 text-[10px] font-mono text-gray-400">{dayjs(n.createdAt).format("DD MMM YYYY")}</td>
                    <td className="py-6 px-8 text-center">
                      <button onClick={() => toggle(n)}
                        className={`text-[9px] px-3 py-1 rounded-full font-black uppercase tracking-widest transition-all ${n.isPublished ? "bg-green-500/10 text-green-500 border border-green-500/20" : "bg-white/5 text-gray-500 border border-white/10"}`}>
                        {n.isPublished ? "Active" : "Draft"}
                      </button>
                    </td>
                    <td className="py-6 px-8 text-center text-[10px] font-black text-gray-300 tracking-tighter">{n.views.toLocaleString()} <span className="text-gray-600 text-[8px] uppercase">Reach</span></td>
                    <td className="py-6 px-8">
                      <div className="flex items-center justify-end gap-3">
                        <Link to={`/admin/news/${n._id}/edit`}
                          className="h-10 px-5 rounded-xl bg-white/5 text-gray-400 text-[10px] font-black uppercase hover:text-white hover:bg-white/10 transition-all flex items-center">
                          Edit
                        </Link>
                        <button onClick={() => remove(n._id)}
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
