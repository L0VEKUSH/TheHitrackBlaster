import { Link } from "react-router-dom";
import { GiShield, GiTargetPrize, GiRibbonMedal } from "react-icons/gi";
import { FaRunning } from "react-icons/fa";
import { motion } from "framer-motion";

const multiSports = [
  { 
    id: 'kabaddi', 
    name: 'Pro Kabaddi League', 
    type: 'Combat Team Sport', 
    image: '/images/sports/kabaddi_action_shot_1778868933875.png', 
    status: 'Live', 
    desc: 'The ultimate test of breath, strength, and tactical precision. Experience the high-intensity world of Kabaddi where every raid counts.',
    icon: <GiShield size={24} />
  },
  { 
    id: 'race', 
    name: 'Track Blaster Series', 
    type: 'Athletics Sprint', 
    image: '/images/sports/sprint_race_finish_1778868962186.png', 
    status: 'Upcoming', 
    desc: 'Lightning fast acceleration and photographic finishes. Join the elite sprinters as they battle for the title of the fastest human.',
    icon: <FaRunning size={24} />
  },
  { 
    id: 'high-jump', 
    name: 'Skyward Invitational', 
    type: 'Field Athletics', 
    image: '/images/sports/high_jump_climax_1778869093637.png', 
    status: 'Season End', 
    desc: 'Gravity-defying leaps that push the boundaries of human potential. A showcase of elegance, timing, and sheer vertical power.',
    icon: <GiTargetPrize size={24} />
  },
  { 
    id: 'long-jump', 
    name: 'Sandstorm Championship', 
    type: 'Field Athletics', 
    image: '/images/sports/long_jump_landing_1778869212138.png', 
    status: 'Live Now', 
    desc: 'Explosive power and technical mastery in every jump. Watch as athletes soar through the air in search of record-breaking distances.',
    icon: <GiRibbonMedal size={24} />
  }
];

export default function MoreGamesPage() {
  return (
    <div className="min-h-screen pb-20 bg-gray-950">
      {/* Hero Section */}
      <div className="relative h-[400px] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-b from-brand-500/20 via-gray-950/80 to-gray-950 z-10" />
          <img src="/images/sports/cricket_stadium_night_1778868674535.png" className="w-full h-full object-cover opacity-40 blur-sm" alt="Background" />
        </div>
        
        <div className="relative z-20 text-center space-y-6 px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-block bg-brand-500 text-white text-[10px] font-black uppercase tracking-[0.4em] px-6 py-2 rounded-full shadow-glow-orange mb-4"
          >
            Expansion Arena
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-5xl md:text-7xl font-black text-white uppercase tracking-tighter italic leading-none"
          >
            Multi-Sport <span className="text-brand-500">Universe</span>
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-gray-400 max-w-xl mx-auto font-bold text-sm uppercase tracking-widest leading-relaxed"
          >
            Beyond the cricket pitch lies a world of raw power, speed, and precision. Explore the next generation of Hitrack sports.
          </motion.p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 -mt-10 relative z-30">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          {multiSports.map((sport, idx) => (
            <motion.div 
              key={sport.id}
              initial={{ opacity: 0, x: idx % 2 === 0 ? -30 : 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="group relative h-[450px] rounded-[3rem] overflow-hidden border border-white/5 bg-gray-900 shadow-premium cursor-pointer"
            >
              <div className="absolute inset-0 z-0">
                <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/20 to-transparent z-10" />
                <img src={sport.image} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" alt={sport.name} />
              </div>

              <div className="absolute top-10 left-10 z-20 flex flex-col gap-4">
                <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-2xl flex items-center justify-center text-white border border-white/20 group-hover:bg-brand-500 group-hover:border-brand-500 group-hover:shadow-glow-orange transition-all duration-500">
                  {sport.icon}
                </div>
                <span className={`inline-block text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl backdrop-blur-2xl border border-white/20 self-start
                  ${sport.status.includes('Live') ? 'bg-red-500/80 text-white animate-pulse border-red-500' : 'bg-black/60 text-white/80'}`}>
                  {sport.status}
                </span>
              </div>

              <div className="absolute bottom-10 left-10 right-10 z-20">
                <div className="text-xs font-black text-brand-400 uppercase tracking-[0.3em] mb-3">{sport.type}</div>
                <h3 className="text-4xl font-black text-white uppercase tracking-tighter leading-none mb-4 group-hover:text-brand-300 transition-colors">{sport.name}</h3>
                <p className="text-sm text-gray-400 font-bold leading-relaxed max-w-md opacity-0 group-hover:opacity-100 transition-all duration-500 translate-y-4 group-hover:translate-y-0">
                  {sport.desc}
                </p>
                <Link to="/multi-sport-live" className="mt-6 bg-white/10 hover:bg-brand-500 text-white text-[10px] font-black uppercase tracking-widest px-8 py-3 rounded-2xl border border-white/10 transition-all opacity-0 group-hover:opacity-100 delay-100 flex items-center justify-center">
                  Enter Arena
                </Link>
              </div>

              <div className="absolute inset-0 bg-brand-500/0 group-hover:bg-brand-500/5 transition-colors duration-500" />
            </motion.div>
          ))}
        </div>

        {/* Call to action */}
        <div className="mt-20 card p-12 bg-gradient-to-br from-brand-600 to-brand-400 rounded-[3rem] text-center space-y-6 shadow-glow-orange">
          <h2 className="text-4xl font-black text-white uppercase tracking-tighter italic">Want to host your game?</h2>
          <p className="text-white/80 font-bold uppercase tracking-widest text-sm">Join the Hitrack platform and bring your tournament to the global stage.</p>
          <button className="bg-gray-950 text-white text-[12px] font-black uppercase tracking-[0.2em] px-10 py-4 rounded-2xl hover:bg-white hover:text-black transition-all">
            Get Started Now
          </button>
        </div>
      </div>
    </div>
  );
}
