// src/pages/HomePage.jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { matchAPI, newsAPI, tournamentAPI } from "../services/api";
import MatchCard from "../components/match/MatchCard";
import Spinner from "../components/common/Spinner";
import { EmptyState } from "../components/common/Spinner";
import { GiCricketBat, GiTrophy, GiTargetPrize, GiRibbonMedal, GiShield } from "react-icons/gi";
import { FaRunning } from "react-icons/fa";
import { FiUser } from "react-icons/fi";

const multiSports = [
  { 
    id: 'kabaddi', 
    name: 'Pro Kabaddi League', 
    type: 'Combat Team Sport', 
    image: '/images/sports/kabaddi_action_shot_1778868933875.png', 
    status: 'Live', 
    desc: 'The ultimate test of breath, strength, and tactical precision.',
    icon: <GiShield size={22} />
  },
  { 
    id: 'race', 
    name: 'Track Blaster Series', 
    type: 'Athletics Sprint', 
    image: '/images/sports/sprint_race_finish_1778868962186.png', 
    status: 'Upcoming', 
    desc: 'Lightning fast acceleration and photographic finishes.',
    icon: <FaRunning size={22} />
  },
  { 
    id: 'high-jump', 
    name: 'Skyward Invitational', 
    type: 'Field Athletics', 
    image: '/images/sports/high_jump_climax_1778869093637.png', 
    status: 'Season End', 
    desc: 'Gravity-defying leaps that push the boundaries of human potential.',
    icon: <GiTargetPrize size={22} />
  },
  { 
    id: 'long-jump', 
    name: 'Sandstorm Championship', 
    type: 'Field Athletics', 
    image: '/images/sports/long_jump_landing_1778869212138.png', 
    status: 'Live', 
    desc: 'Explosive power and technical mastery in every jump.',
    icon: <GiRibbonMedal size={22} />
  }
];

export default function HomePage() {
  const [live,        setLive]        = useState([]);
  const [upcoming,    setUpcoming]    = useState([]);
  const [recent,      setRecent]      = useState([]);
  const [news,        setNews]        = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    Promise.all([
      matchAPI.getAll({ status: "live",      limit: 6 }),
      matchAPI.getAll({ status: "upcoming",  limit: 6 }),
      matchAPI.getAll({ status: "completed", limit: 4 }),
      newsAPI.getAll({ limit: 5 }),
      tournamentAPI.getAll({ active: "true", featured: "true" }),
    ]).then(([l, u, r, n, t]) => {
      setLive(l.data.matches        || []);
      setUpcoming(u.data.matches    || []);
      setRecent(r.data.matches      || []);
      setNews(n.data.news           || []);
      setTournaments(t.data.tournaments || []);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner size="lg" />;

  const featuredNews = news[0];

  return (
    <div className="min-h-screen pb-20">
      <div className="max-w-7xl mx-auto px-6 py-8">
        
        {/* Cinematic Hero Section */}
        {featuredNews && (
          <div className="relative h-[450px] rounded-[2.5rem] overflow-hidden mb-12 shadow-premium group">
            <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/20 to-transparent z-10" />
            <img src={featuredNews.image} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105" alt="Hero" />
            <div className="absolute bottom-0 left-0 p-10 z-20 max-w-2xl space-y-4">
              <div className="flex gap-2">
                <span className="bg-brand-500 text-white text-[10px] font-black uppercase tracking-widest px-4 py-1 rounded-full shadow-glow-orange">Editorial Pick</span>
                <span className="bg-white/10 backdrop-blur-md text-white text-[10px] font-black uppercase tracking-widest px-4 py-1 rounded-full border border-white/10">Sports Insight</span>
              </div>
              <h1 className="text-4xl md:text-6xl font-black text-white leading-none tracking-tighter drop-shadow-2xl">
                {featuredNews.title}
              </h1>
              <Link to={`/news/${featuredNews._id}`} className="btn-primary inline-block mt-4">Read Full Story</Link>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2 space-y-12">
            
            {/* Live Action */}
            <section>
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 bg-red-500 rounded-full animate-ping" />
                  <h2 className="text-2xl font-black text-white uppercase tracking-tighter italic">Live Action</h2>
                </div>
                <Link to="/matches?status=live" className="text-[10px] font-black text-brand-400 uppercase tracking-widest border-b border-brand-500/20 pb-1 hover:text-brand-500">Explore All</Link>
              </div>
              {live.length === 0
                ? <EmptyState icon="📡" title="No live matches" sub="Check back soon for the next clash" />
                : <div className="grid md:grid-cols-2 gap-6">
                    {live.map(m => <MatchCard key={m._id} match={m} />)}
                  </div>
              }
            </section>

            {/* Upcoming Battleground */}
            <section>
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-black text-white uppercase tracking-tighter italic">Upcoming Battles</h2>
                <Link to="/matches?status=upcoming" className="text-[10px] font-black text-brand-400 uppercase tracking-widest border-b border-brand-500/20 pb-1 hover:text-brand-500">View Schedule</Link>
              </div>
              {upcoming.length === 0
                ? <EmptyState icon="📅" title="No upcoming matches" />
                : <div className="grid md:grid-cols-2 gap-6">
                    {upcoming.map(m => <MatchCard key={m._id} match={m} />)}
                  </div>
              }
            </section>
          </div>

          {/* Premium Sidebar */}
          <div className="space-y-10">
            {/* Trending Series */}
            {tournaments.length > 0 && (
              <div className="card p-8 bg-gradient-to-br from-gray-900 to-gray-950 border-t-2 border-brand-500">
                <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-8">🔥 Top Series</h3>
                <div className="space-y-6">
                  {tournaments.map(t => (
                    <Link key={t._id} to={`/tournaments/${t._id}`}
                      className="flex items-center gap-4 group"
                    >
                      {t.logo
                        ? <img src={t.logo} alt="" className="w-12 h-12 object-contain rounded-2xl bg-white/5 p-2 transition-all group-hover:bg-brand-500/10 group-hover:scale-110"/>
                        : <div className="w-12 h-12 bg-gray-800 rounded-2xl flex items-center justify-center text-lg shadow-inner group-hover:bg-brand-500 transition-colors">🏆</div>
                      }
                      <div className="space-y-1">
                        <div className="text-white text-[13px] font-black group-hover:text-brand-400 transition-colors">{t.name}</div>
                        <div className="text-[9px] font-bold text-gray-600 uppercase tracking-widest">{t.format} • {t.host}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

          </div>

        </div>
      </div>
    </div>
  );
}
