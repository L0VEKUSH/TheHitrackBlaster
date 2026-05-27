// src/pages/NewsPage.jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { newsAPI } from "../services/api";
import Spinner from "../components/common/Spinner";
import { EmptyState, PageHeader } from "../components/common/Spinner";
import dayjs from "dayjs";
import { GiCricketBat } from "react-icons/gi";
import relativeTime from "dayjs/plugin/relativeTime";
dayjs.extend(relativeTime);

const CATS = ["All","match","series","player","team","general","ranking"];

export default function NewsPage() {
  const [news,    setNews]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [cat,     setCat]     = useState("All");
  const [page,    setPage]    = useState(1);
  const [total,   setTotal]   = useState(0);

  useEffect(() => {
    setLoading(true); setPage(1);
    const params = { limit: 12 };
    if (cat !== "All") params.category = cat;
    newsAPI.getAll(params)
      .then(({ data }) => { setNews(data.news || []); setTotal(data.total || 0); })
      .finally(() => setLoading(false));
  }, [cat]);

  const loadMore = () => {
    const next = page + 1;
    const params = { limit: 12, page: next };
    if (cat !== "All") params.category = cat;
    newsAPI.getAll(params)
      .then(({ data }) => { setNews(p => [...p, ...(data.news || [])]); setPage(next); });
  };

  const featured = news.find(n => n.isFeatured) || news[0];
  const others = news.filter(n => n._id !== featured?._id);

  return (
    <div className="min-h-screen pb-20">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          
          {/* Main News Content */}
          <div className="flex-1 space-y-10">
            {/* Featured Hero */}
            {featured && (
              <Link to={`/news/${featured._id}`} className="block relative group overflow-hidden rounded-[2rem] shadow-2xl">
                <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/40 to-transparent z-10" />
                <img src={featured.image} className="w-full h-[500px] object-cover group-hover:scale-105 transition-transform duration-700" alt="Hero" />
                <div className="absolute bottom-0 left-0 p-8 z-20 space-y-4">
                  <span className="bg-brand-500 text-white text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-glow-orange">Featured Story</span>
                  <h1 className="text-4xl md:text-5xl font-black text-white leading-none tracking-tighter drop-shadow-2xl">{featured.title}</h1>
                  <p className="text-gray-300 text-sm max-w-xl line-clamp-2">{featured.summary}</p>
                </div>
              </Link>
            )}

            {/* Category Filter */}
            <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
              {CATS.map(c => (
                <button key={c} onClick={() => setCat(c)}
                  className={`px-6 py-2 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                    cat === c ? "bg-brand-500 text-white shadow-glow-orange" : "bg-white/5 text-gray-500 hover:text-white hover:bg-white/10"
                  }`}>{c}</button>
              ))}
            </div>

            {loading ? <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[1,2,3,4].map(i => <div key={i} className="h-64 bg-white/5 animate-pulse rounded-3xl" />)}
            </div> : news.length === 0
              ? <EmptyState icon="📰" title="No news yet" sub="Check back later for fresh updates" />
              : <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {others.map(n => (
                      <Link key={n._id} to={`/news/${n._id}`}
                        className="card card-hover group overflow-hidden flex flex-col"
                      >
                        <div className="h-56 overflow-hidden relative">
                          <img src={n.image} alt={n.title}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"/>
                          <div className="absolute top-4 left-4 bg-gray-950/80 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
                            <span className="text-[9px] font-black text-brand-400 uppercase tracking-widest">{n.category}</span>
                          </div>
                        </div>
                        <div className="p-6 space-y-3 flex-1">
                          <h3 className="text-white font-black text-lg leading-tight group-hover:text-brand-400 transition-colors">{n.title}</h3>
                          <p className="text-gray-500 text-xs line-clamp-2 leading-relaxed">{n.summary}</p>
                          <div className="flex items-center justify-between pt-4 mt-auto border-t border-white/5 text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                            <span>By {n.author}</span>
                            <span>{dayjs(n.createdAt).fromNow()}</span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                  {news.length < total && (
                    <div className="text-center mt-12">
                      <button onClick={loadMore} className="btn-ghost px-12 py-4 text-xs font-black uppercase tracking-[0.2em]">Explore More</button>
                    </div>
                  )}
                </>
            }
          </div>

          {/* Trending Sidebar */}
          <div className="lg:w-80 space-y-8">
            <div className="card p-6 border-t-2 border-brand-500">
              <h3 className="text-sm font-black text-white uppercase tracking-widest mb-6 flex items-center gap-2">
                <span className="w-2 h-2 bg-brand-500 rounded-full animate-ping" />
                Trending Now
              </h3>
              <div className="space-y-6">
                {news.slice(0, 5).map((n, i) => (
                  <Link key={n._id} to={`/news/${n._id}`} className="flex gap-4 group">
                    <span className="text-2xl font-black text-white/10 group-hover:text-brand-500/20 transition-colors">0{i+1}</span>
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-gray-200 line-clamp-2 leading-snug group-hover:text-brand-400 transition-colors">{n.title}</h4>
                      <span className="text-[9px] font-bold text-gray-600 uppercase tracking-tighter">{n.category}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            <div className="card p-6 bg-gradient-to-br from-brand-600 to-brand-400 text-white relative overflow-hidden group">
              <div className="absolute -right-4 -bottom-4 opacity-10 rotate-12 transition-transform group-hover:scale-125">
                <GiCricketBat size={120} />
              </div>
              <h3 className="text-lg font-black leading-tight mb-2">Hype Mode Active</h3>
              <p className="text-xs text-white/80 leading-relaxed mb-4">Experience the match like never before with 3D reactions and Typing....s.</p>
              <button className="bg-white text-brand-600 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl hover:bg-gray-950 hover:text-white transition-all">Go Pro</button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
