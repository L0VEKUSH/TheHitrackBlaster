// src/components/common/Footer.jsx
import { Link } from "react-router-dom";
import { GiCricketBat } from "react-icons/gi";
import { useEffect, useState } from "react";
import { pollAPI } from "../../services/api";

export default function Footer() {
  const [topFans, setTopFans] = useState([]);
  const [loadingRanks, setLoadingRanks] = useState(true);
  const [rankError, setRankError] = useState(false);

  useEffect(() => {
    const fetchTopFans = async () => {
      try {
        const { data } = await pollAPI.getLeaderboard();
        setTopFans(Array.isArray(data.data) ? data.data.slice(0, 3) : []);
      } catch (err) {
        console.error("Failed to load fan rankings", err);
        setRankError(true);
      } finally {
        setLoadingRanks(false);
      }
    };
    fetchTopFans();
  }, []);

  return (
    <footer className="bg-gray-950/60 backdrop-blur-xl border-t border-white/5 mt-20 pt-16 pb-8 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-brand-500/50 to-transparent shadow-[0_0_15px_rgba(249,115,22,0.3)]" />

      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12 mb-16">
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="bg-brand-500 p-2 rounded-xl">
                <GiCricketBat className="text-white text-xl" />
              </div>
              <div className="flex flex-col leading-none">
                <span className="font-black text-white text-lg tracking-tighter italic uppercase">The Hitrack</span>
                <span className="font-bold text-brand-500 text-[9px] uppercase tracking-[0.3em] ml-1">Blaster</span>
              </div>
            </div>
            <p className="text-gray-500 text-[11px] leading-relaxed max-w-xs font-medium">
              The hitrack blaster is highly and enjoyable website for cricket lovers. rembember my name L...
            </p>
          </div>

          <div>
            <h4 className="text-white font-black text-xs uppercase tracking-widest mb-6">Explore</h4>
            <ul className="space-y-4">
              {[["Matches", "/matches"], ["Global Rankings", "/rankings"], ["Tournaments", "/tournaments"], ["Latest News", "/news"], ["Explore Me", "/about-me"]].map(([l, h]) => (
                <li key={l}>
                  <Link to={h} className="flex items-center gap-2 text-gray-500 hover:text-brand-400 text-xs font-bold transition-all hover:translate-x-1 inline-block">
                    {l === "Explore Me" && (
                      <img src="/images/author.svg" alt="Author" className="w-6 h-6 rounded-full object-cover border border-white/5" />
                    )}
                    <span>{l}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-white font-black text-xs uppercase tracking-widest mb-6">Platform</h4>
            <ul className="space-y-4">
              {[["Meet the Team", "/management"], ["Teams Database", "/teams"], ["Player Profiles", "/players"], ["More Games", "/more-games"], ["Live Polls", "#"], ["Other Services", "/other-services"]].map(([l, h]) => (
                <li key={l}><Link to={h} className="text-gray-500 hover:text-brand-400 text-xs font-bold transition-all hover:translate-x-1 inline-block">{l}</Link></li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-white font-black text-xs uppercase tracking-widest mb-6">Stay Connected</h4>
            <p className="text-gray-600 text-[10px] font-bold uppercase tracking-widest mb-4">Subscribe to Highlights</p>
            <div className="flex gap-2">
              <input type="text" placeholder="Email Address" className="input text-xs py-2 px-3 bg-white/5 border-white/5 flex-1" />
              <button className="bg-brand-500 hover:bg-brand-600 text-white p-2 rounded-xl transition-all shadow-glow-orange">
                <span className="text-[10px] font-black uppercase px-2">Join</span>
              </button>
            </div>
          </div>

          <div>
            <h4 className="text-white font-black text-xs uppercase tracking-widest mb-6">🏆 Fan Rankings</h4>
            <div className="space-y-3">
              {loadingRanks ? (
                <p className="text-[10px] text-gray-600 italic">Loading rankings...</p>
              ) : rankError ? (
                <p className="text-[10px] text-red-500 italic">Unable to load rankings.</p>
              ) : topFans.length > 0 ? (
                topFans.map((fan, idx) => (
                  <div key={fan._id} className="flex items-center gap-3 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                    <div className="w-6 h-6 rounded-full bg-brand-500 text-white text-[10px] font-black flex items-center justify-center">
                      #{idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-white truncate">{fan.name}</div>
                      <div className="text-[9px] text-brand-400 font-bold">{fan.pollPoints} pts</div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-[10px] text-gray-600 italic">No rankings available yet.</p>
              )}
              <Link to="/fan-rankings" className="text-[10px] text-gray-500 hover:text-brand-400 font-bold uppercase tracking-widest transition-colors block mt-3 border-t border-white/5 pt-3">
                View All Rankings →
              </Link>
            </div>
          </div>
        </div>

        <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] font-bold text-gray-700 uppercase tracking-[0.2em]">
          <div>© {new Date().getFullYear()} The Hitrack Blaster. Professional Grade.</div>
          <div className="flex gap-6">
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <a href="#" className="hover:text-white transition-colors">Terms</a>
            <a href="#" className="hover:text-white transition-colors">Advertise</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
