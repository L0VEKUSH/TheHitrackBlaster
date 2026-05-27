import { motion } from "framer-motion";
import { FiBox, FiActivity, FiImage, FiPlus, FiChevronRight } from "react-icons/fi";

const services = [
  {
    title: "Our Products",
    description: "Premium sports gear and equipment curated for high-intensity performance. From custom kits to professional grade accessories.",
    icon: <FiBox />,
    color: "from-blue-500 to-cyan-500",
    link: "#"
  },
  {
    title: "Our Services",
    description: "Professional coaching, tournament management, and high-intensity sports analytics. We provide the infrastructure for excellence.",
    icon: <FiActivity />,
    color: "from-brand-500 to-orange-600",
    link: "#"
  },
  {
    title: "Sports Gallery",
    description: "Relive the most intense moments of the season. High-definition captures of every wicket, goal, and photo-finish.",
    icon: <FiImage />,
    color: "from-purple-500 to-pink-600",
    link: "#"
  }
];

export default function OtherServices() {
  return (
    <div className="min-h-screen pt-24 pb-20 px-6 max-w-7xl mx-auto">
      {/* Header Section */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-20"
      >
        <h1 className="text-5xl md:text-7xl font-black text-white uppercase italic tracking-tighter leading-none mb-6">
          Premium <span className="text-brand-500">Services</span>
        </h1>
        <p className="text-gray-500 font-bold uppercase tracking-[0.3em] text-xs">
          Empowering the next generation of athletes
        </p>
      </motion.div>

      {/* Services Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {services.map((s, i) => (
          <motion.div
            key={s.title}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="group relative"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-white/[0.02] rounded-[2rem] border border-white/5 transition-all group-hover:border-white/10" />
            <div className="relative p-10 flex flex-col h-full">
              <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${s.color} flex items-center justify-center text-3xl text-white shadow-lg mb-8 transition-transform group-hover:scale-110 group-hover:rotate-6`}>
                {s.icon}
              </div>
              <h3 className="text-2xl font-black text-white uppercase italic tracking-tight mb-4">{s.title}</h3>
              <p className="text-gray-500 text-sm font-medium leading-relaxed mb-8 flex-1">
                {s.description}
              </p>
              <button className="flex items-center gap-2 text-white font-black uppercase text-[10px] tracking-widest hover:text-brand-500 transition-colors">
                Explore More <FiChevronRight />
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Admin Section / Placeholder */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-20 p-1 bg-gradient-to-r from-transparent via-white/5 to-transparent rounded-full"
      />

      <div className="mt-20 text-center space-y-8">
        <div className="inline-flex items-center gap-4 bg-white/5 border border-white/5 px-6 py-3 rounded-full">
          <div className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
          <span className="text-[10px] font-black text-white uppercase tracking-widest italic">
            Expanding Our Horizons
          </span>
        </div>
        
        <div className="max-w-2xl mx-auto space-y-6">
          <h2 className="text-3xl font-black text-white uppercase tracking-tight">Need more facilities?</h2>
          <p className="text-gray-500 font-medium">
            Our platform is built to grow. Administrators can dynamically add new service categories and custom facilities to meet the evolving needs of our sports community.
          </p>
          <div className="pt-4">
            <button className="bg-white/5 hover:bg-white/10 border border-white/10 text-white px-8 py-4 rounded-2xl transition-all flex items-center gap-3 mx-auto group">
              <div className="w-10 h-10 rounded-xl bg-brand-500/20 text-brand-500 flex items-center justify-center transition-transform group-hover:rotate-12">
                <FiPlus />
              </div>
              <span className="font-black uppercase text-xs tracking-widest">Request New Facility</span>
            </button>
          </div>
        </div>
      </div>

      {/* Decorative Background Elements */}
      <div className="fixed top-1/2 left-0 -translate-y-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-brand-500/10 blur-[150px] rounded-full -z-10 pointer-events-none" />
      <div className="fixed bottom-0 right-0 translate-y-1/2 translate-x-1/2 w-[400px] h-[400px] bg-purple-500/10 blur-[150px] rounded-full -z-10 pointer-events-none" />
    </div>
  );
}
