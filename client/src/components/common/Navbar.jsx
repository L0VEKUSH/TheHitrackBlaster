// src/components/common/Navbar.jsx
import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { FiMenu, FiX, FiUser, FiLogOut } from "react-icons/fi";
import { GiCricketBat } from "react-icons/gi";
import { motion, AnimatePresence } from "framer-motion";

const LINKS = [
  { to: "/", label: "Home" },
  { to: "/matches", label: "Matches" },
  { to: "/tournaments", label: "Series" },
  { to: "/rankings", label: "Rankings" },
  { to: "/news", label: "News" },
  { to: "/teams", label: "Teams" },
  { to: "/players", label: "Players" },
  { to: "/management", label: "Management" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const { user, admin, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate("/"); };

  return (
    <header className="glass-nav shadow-premium">
      {/* Top micro-bar */}
      <div className="bg-gradient-to-r from-brand-600 to-brand-400 text-white text-[10px] font-black uppercase tracking-[0.2em] py-1.5 px-6 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
          </span>
          <span>The Hitrack</span>
        </div>
        <div className="hidden md:flex items-center gap-6">
          {admin ? (
            <Link to="/admin" className="hover:text-black transition-colors">Admin Dashboard</Link>
          ) : user ? (
            <div className="flex items-center gap-4">
              <span className="text-white/80">{user.name}</span>
              <span className="text-brand-400 font-bold bg-white/10 px-2 py-0.5 rounded-lg">{user.pollPoints || 0} pts</span>
              <button onClick={handleLogout} className="hover:text-black transition-colors font-bold">Logout</button>
            </div>
          ) : (
            <div className="flex gap-4">
              <Link to="/login" className="hover:text-black transition-colors font-bold">Login</Link>
              <Link to="/register" className="bg-white text-brand-600 px-2 py-0.5 rounded font-black hover:bg-black hover:text-white transition-all">Join Pro</Link>
            </div>
          )}
        </div>
      </div>

      <nav className="max-w-7xl mx-auto px-6 flex items-center h-16 justify-between">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="bg-brand-500 p-2 rounded-xl group-hover:rotate-12 transition-transform shadow-glow-orange">
            <GiCricketBat className="text-white text-xl" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-black text-white text-xl tracking-tighter italic uppercase">The Hitrack</span>
            <span className="font-bold text-brand-500 text-[10px] uppercase tracking-[0.3em] ml-1">Blaster</span>
          </div>
        </Link>

        {/* Desktop links */}
        <div className="hidden lg:flex items-center gap-2">
          {LINKS.map(l => (
            <NavLink key={l.to} to={l.to} end={l.to === "/"}
              className={({ isActive }) =>
                `relative text-[13px] font-bold px-4 py-2 rounded-xl transition-all duration-300 group ${isActive
                  ? "text-brand-500 bg-brand-500/5"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
                }`
              }
            >
              {l.label}
              {l.label === "Matches" && (
                <span className="absolute -top-1 -right-1 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
              )}
              <div className="absolute bottom-1 left-4 right-4 h-0.5 bg-brand-500 scale-x-0 group-hover:scale-x-100 transition-transform origin-left rounded-full" />
            </NavLink>
          ))}
        </div>

        {/* Action area */}
        <div className="flex items-center gap-4">
          <button className="lg:hidden text-white bg-white/5 p-2 rounded-xl border border-white/5" onClick={() => setOpen(o => !o)}>
            {open ? <FiX size={24} /> : <FiMenu size={24} />}
          </button>
          <div className="hidden lg:block">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-500 to-accent-500 p-[2px] shadow-glow-orange">
              <div className="w-full h-full bg-gray-950 rounded-full flex items-center justify-center text-white">
                <FiUser size={18} />
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="lg:hidden bg-gray-950/95 backdrop-blur-2xl border-t border-white/5 px-6 py-6 space-y-2"
          >
            {LINKS.map(l => (
              <NavLink key={l.to} to={l.to} end={l.to === "/"}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `flex items-center justify-between py-3 px-4 rounded-2xl text-sm font-black uppercase tracking-widest transition-all ${isActive ? "text-brand-500 bg-brand-500/10 border border-brand-500/20" : "text-gray-400 bg-white/5"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {l.label}
                    {isActive && <div className="w-1.5 h-1.5 rounded-full bg-brand-500 shadow-glow-orange" />}
                  </>
                )}
              </NavLink>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
