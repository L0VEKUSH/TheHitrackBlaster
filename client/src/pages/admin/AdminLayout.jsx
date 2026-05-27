// src/pages/admin/AdminLayout.jsx
import { Link, Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useState } from "react";
import { GiCricketBat } from "react-icons/gi";
import { FiHome, FiCalendar, FiUsers, FiFlag, FiFileText, FiAward, FiLogOut, FiMenu, FiX, FiBriefcase, FiUser, FiActivity, FiBox } from "react-icons/fi";

const NAV = [
  { to: "/admin", label: "Dashboard", icon: <FiHome /> },
  { to: "/admin/matches", label: "Matches", icon: <FiCalendar /> },
  { to: "/admin/tournaments", label: "Tournaments", icon: <FiAward /> },
  { to: "/admin/multi-sport", label: "Multi-Sport", icon: <FiActivity /> },
  { to: "/admin/players", label: "Players", icon: <FiUsers /> },
  { to: "/admin/teams", label: "Teams", icon: <FiFlag /> },
  { to: "/admin/news", label: "News", icon: <FiFileText /> },
  { to: "/admin/management", label: "Management", icon: <FiBriefcase /> },
  { to: "/admin/about-me", label: "About Me", icon: <FiUser /> },
  { to: "/admin/services", label: "Services", icon: <FiBox /> },
];

export default function AdminLayout() {
  const { admin, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const handleLogout = () => { logout(); navigate("/admin/login"); };

  const Sidebar = () => (
    <div className="flex flex-col h-full">
      <div className="p-8 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="bg-brand-500 p-2 rounded-xl shadow-glow-orange">
            <GiCricketBat className="text-white text-xl" />
          </div>
          <div>
            <div className="text-white font-black text-xs uppercase tracking-tighter italic">Hitrack <span className="text-brand-500">Core</span></div>
            <div className="text-gray-600 text-[8px] font-black uppercase tracking-[0.3em]">Command Center</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-4 py-8 space-y-2 overflow-y-auto custom-scrollbar">
        {NAV.map(({ to, label, icon }) => (
          <NavLink key={to} to={to} end={to === "/admin"}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-4 px-4 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all group ${isActive
                ? "bg-brand-500 text-white shadow-glow-orange"
                : "text-gray-500 hover:text-white hover:bg-white/5"
              }`
            }
          >
            <span className="text-lg transition-transform group-hover:scale-110">{icon}</span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-6 border-t border-white/5 bg-black/20">
        <div className="flex items-center gap-3 mb-6 px-2">
          <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10 overflow-hidden">
            <FiUser className="text-gray-400" />
          </div>
          <div className="min-w-0">
            <div className="text-white text-[10px] font-black uppercase truncate">{admin?.name}</div>
            <div className="text-brand-500 text-[8px] font-bold uppercase tracking-widest">{admin?.role}</div>
          </div>
        </div>

        <div className="space-y-2">
          <button onClick={handleLogout}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-red-500 hover:bg-red-500/10 transition-all">
            <FiLogOut className="text-lg" /> Logout
          </button>
          <Link to="/"
            className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-700 hover:text-brand-400 transition-all">
            <span className="text-lg">↗</span> View Site
          </Link>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-950 flex font-sans selection:bg-brand-500/30">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-72 shrink-0 flex-col bg-gray-950 border-r border-white/5 fixed left-0 top-0 bottom-0 z-40">
        <Sidebar />
      </aside>

      {/* Mobile Sidebar */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/90 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="relative w-72 bg-gray-950 border-r border-white/5 flex flex-col z-50">
            <Sidebar />
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:ml-72 flex flex-col min-h-screen relative">
        <header className="sticky top-0 z-30 h-20 bg-gray-950/50 backdrop-blur-xl border-b border-white/5 flex items-center px-8 justify-between">
          <div className="flex items-center gap-4">
            <button className="lg:hidden text-white bg-white/5 p-2 rounded-xl" onClick={() => setOpen(o => !o)}>
              {open ? <FiX size={20} /> : <FiMenu size={20} />}
            </button>
            <div className="flex flex-col">Hitrack blaster
              <span className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em] mb-1"></span>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="hidden md:flex flex-col text-right">
              <span className="text-[8px] font-black text-gray-600 uppercase tracking-widest">Active Tournament</span>

            </div>
          </div>
        </header>

        <main className="flex-1 p-8 lg:p-12 overflow-auto bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-brand-500/5 via-transparent to-transparent">
          <div className="max-w-6xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
