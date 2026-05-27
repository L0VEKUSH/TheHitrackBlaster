// src/pages/admin/AdminDashboard.jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { matchAPI, playerAPI, teamAPI, newsAPI } from "../../services/api";
import { GiCricketBat } from "react-icons/gi";

export default function AdminDashboard() {
  const [stats, setStats] = useState({ matches: 0, live: 0, players: 0, teams: 0, news: 0 });

  useEffect(() => {
    Promise.allSettled([
      matchAPI.getAll({ limit: 1 }),
      matchAPI.getAll({ status: "live", limit: 1 }),
      playerAPI.getAll({ limit: 1 }),
      teamAPI.getAll(),
      newsAPI.getAll({ limit: 1 }),
    ]).then(([m, l, p, t, n]) => setStats({
      matches: m.value?.data?.total || 0,
      live: l.value?.data?.total || 0,
      players: p.value?.data?.total || 0,
      teams: t.value?.data?.teams?.length || 0,
      news: n.value?.data?.total || 0,
    }));
  }, []);

  const QUICK = [
    ["Add Match",      "/admin/matches/new",      "🏏"],
    ["Add Player",     "/admin/players/new",      "🧑"],
    ["Add Team",       "/admin/teams/new",        "👥"],
    ["Write News",     "/admin/news/new",         "📰"],
    ["Add Tournament", "/admin/tournaments/new",  "🏆"],
  ];

  return (
    <div className="space-y-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-white uppercase italic tracking-tighter">System <span className="text-brand-500">Overview</span></h1>
          <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mt-2">Welcome to The Hitrack Blaster Command Center</p>
        </div>
        <div className="flex items-center gap-3">
           <div className="bg-white/5 border border-white/10 rounded-2xl px-6 py-3 flex flex-col items-end">
              <span className="text-[8px] font-black text-gray-600 uppercase tracking-widest mb-1">Server Latency</span>
              <span className="text-xs font-black text-green-500">12ms · Stable</span>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-6">
        {[
          { label:"Active Matches", value:stats.matches, icon:"🏏", color:"from-blue-500/20", glow:"shadow-blue-500/20" },
          { label:"Live Now",      value:stats.live,    icon:"🔴", color:"from-red-500/20",  glow:"shadow-red-500/20" },
          { label:"Players",       value:stats.players, icon:"🧑", color:"from-brand-500/20", glow:"shadow-brand-500/20" },
          { label:"Teams",        value:stats.teams,   icon:"👥", color:"from-accent-500/20",glow:"shadow-accent-500/20" },
          { label:"Field Reports",  value:stats.news,    icon:"📰", color:"from-gray-500/20",  glow:"shadow-gray-500/20" },
          { label:"Multi-Sport Hub", value:"4 Active",   icon:"🎮", color:"from-purple-500/20", glow:"shadow-purple-500/20" },
        ].map((c) => (
          <div key={c.label} className={`card p-8 bg-gradient-to-br ${c.color} to-transparent border-white/5 transition-all hover:-translate-y-2 hover:shadow-2xl ${c.glow}`}>
            <div className="text-3xl mb-6">{c.icon}</div>
            <div className="text-4xl font-black text-white mb-2">{c.value}</div>
            <div className="text-[9px] font-black text-gray-500 uppercase tracking-widest">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
           <div className="card p-10 bg-gray-900/40 border-white/5">
              <div className="flex items-center justify-between mb-10">
                <h2 className="text-sm font-black text-white uppercase tracking-widest">Rapid Matchs</h2>
                <div className="h-[1px] flex-1 bg-white/5 mx-6" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
                {QUICK.map(([l,to,icon]) => (
                  <Link key={l} to={to}
                    className="flex flex-col items-center p-6 rounded-3xl bg-white/5 hover:bg-brand-500 hover:scale-105 transition-all group border border-white/5">
                    <div className="text-3xl mb-4 group-hover:scale-110 transition-transform">{icon}</div>
                    <div className="text-[10px] font-black text-white uppercase tracking-widest">{l}</div>
                  </Link>
                ))}
              </div>
           </div>
        </div>

        <div className="space-y-8">
           <div className="card p-10 bg-brand-500 text-white relative overflow-hidden group shadow-glow-orange border-none">
              <div className="absolute -right-10 -bottom-10 opacity-10 rotate-12 transition-transform group-hover:scale-125">
                 <GiCricketBat size={200} />
              </div>
              <h2 className="text-2xl font-black italic uppercase tracking-tighter mb-6 leading-none">System <br/>Integrity</h2>
              <ul className="space-y-4">
                 {[
                   { l: "Create Teams", to: "/admin/teams/new" },
                   { l: "Enlist Players", to: "/admin/players/new" },
                   { l: "Host Tournament", to: "/admin/tournaments/new" },
                   { l: "Manage Multi-Sport", to: "/admin/multi-sport" },
                   { l: "Command Scoring", to: "/admin/matches" },
                 ].map((item, i) => (
                   <li key={i} className="flex items-center gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
                      <Link to={item.to} className="text-[10px] font-black uppercase tracking-widest hover:translate-x-1 transition-transform">{item.l}</Link>
                   </li>
                 ))}
              </ul>
              <button className="w-full mt-10 py-4 bg-gray-950 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-white hover:text-black transition-all">Download Logs</button>
           </div>
        </div>
      </div>
    </div>
  );
}
