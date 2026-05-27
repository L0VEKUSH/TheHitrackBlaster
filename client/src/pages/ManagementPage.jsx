import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api from "../services/api";
import { FiTwitter, FiLinkedin, FiInstagram, FiMail, FiUsers } from "react-icons/fi";

const ManagementPage = () => {
  const [management, setManagement] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchManagement = async () => {
      try {
        const { data } = await api.get("/management");
        if (data.success) {
          setManagement(data.data);
        }
      } catch (err) {
        console.error("Error fetching management team:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchManagement();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="relative">
           <div className="w-16 h-16 border-4 border-brand-500/20 rounded-full" />
           <div className="w-16 h-16 border-4 border-brand-500 border-t-transparent rounded-full animate-spin absolute top-0 left-0" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white pb-32 overflow-hidden">
      {/* Cinematic Hero */}
      <div className="relative h-[60vh] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-b from-brand-600/20 via-gray-950/80 to-gray-950 z-10" />
          <img 
            src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?q=80&w=2070&auto=format&fit=crop" 
            className="w-full h-full object-cover opacity-20 grayscale" 
            alt="Team Workspace" 
          />
        </div>
        
        <div className="relative z-20 text-center px-6 space-y-6">
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-20 h-20 mx-auto bg-brand-500 rounded-3xl flex items-center justify-center shadow-glow-orange rotate-12 mb-8"
          >
            <FiUsers className="text-white text-3xl -rotate-12" />
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-6xl md:text-8xl font-black uppercase tracking-tighter italic leading-none"
          >
            The <span className="text-brand-500">Hitrack</span> <br/>Team
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-gray-400 font-bold text-xs md:text-sm uppercase tracking-[0.5em] max-w-2xl mx-auto"
          >
            Meet the visionaries behind the next generation of sports tech
          </motion.p>
        </div>

        {/* Decorative Lines */}
        <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-brand-500/50 to-transparent" />
      </div>

      <div className="max-w-7xl mx-auto px-6 mt-[-100px] relative z-30">
        {management.length === 0 ? (
          <div className="p-20 text-center rounded-[3rem] bg-gray-900 border border-white/5 border-dashed">
            <p className="text-gray-600 text-xs font-black uppercase tracking-widest">Team database is currently being updated.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-10">
            {management.map((member, i) => (
              <motion.div 
                key={member._id} 
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="group relative"
              >
                {/* Member Card */}
                <div className="relative aspect-[3/4.5] rounded-[2.5rem] overflow-hidden border border-white/10 shadow-premium group-hover:border-brand-500/50 transition-all duration-500">
                  {/* Image */}
                  <div className="absolute inset-0">
                    {member.image ? (
                      <img 
                        src={member.image} 
                        className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110 grayscale group-hover:grayscale-0"
                        alt={member.name}
                      />
                    ) : (
                      <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                        <span className="text-gray-600 text-8xl font-black opacity-10">{member.name.charAt(0)}</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-60 group-hover:opacity-40 transition-opacity" />
                  </div>

                  {/* Content Overlay */}
                  <div className="absolute inset-x-0 bottom-0 p-8 pt-20 bg-gradient-to-t from-black via-black/80 to-transparent">
                    <div className="space-y-4">
                      <div>
                        <motion.h3 className="text-2xl font-black text-white uppercase tracking-tighter italic group-hover:text-brand-400 transition-colors">
                          {member.name}
                        </motion.h3>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="h-0.5 w-4 bg-brand-500" />
                          <span className="text-brand-500 text-[10px] font-black uppercase tracking-widest">
                            {member.role}
                          </span>
                        </div>
                      </div>
                      
                      <p className="text-gray-400 text-[10px] font-bold leading-relaxed line-clamp-3 uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-all duration-500 transform translate-y-4 group-hover:translate-y-0">
                        {member.bio}
                      </p>

                      {/* Socials */}
                      <div className="flex gap-3 pt-2 transform translate-y-8 group-hover:translate-y-0 transition-all duration-500">
                        {member.socialLinks?.twitter && (
                          <a href={member.socialLinks.twitter} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-xl bg-white/10 hover:bg-brand-500 text-white flex items-center justify-center transition-all border border-white/10">
                            <FiTwitter size={16} />
                          </a>
                        )}
                        {member.socialLinks?.linkedin && (
                          <a href={member.socialLinks.linkedin} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-xl bg-white/10 hover:bg-brand-500 text-white flex items-center justify-center transition-all border border-white/10">
                            <FiLinkedin size={16} />
                          </a>
                        )}
                        {member.socialLinks?.instagram && (
                          <a href={member.socialLinks.instagram} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-xl bg-white/10 hover:bg-brand-500 text-white flex items-center justify-center transition-all border border-white/10">
                            <FiInstagram size={16} />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Corner Accent */}
                  <div className="absolute top-6 right-6">
                    <div className="w-8 h-8 border-t-2 border-r-2 border-white/20 group-hover:border-brand-500 transition-colors" />
                  </div>
                </div>

                {/* Decorative Shadow Blur */}
                <div className="absolute -inset-2 bg-brand-500/10 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity rounded-[3rem] -z-10" />
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Join the Team Section */}
      <section className="max-w-4xl mx-auto px-6 mt-40">
         <motion.div 
           whileHover={{ scale: 1.02 }}
           className="p-16 rounded-[4rem] bg-gradient-to-br from-gray-900 to-black border border-brand-500/20 text-center relative overflow-hidden"
         >
            <div className="absolute top-0 right-0 p-20 bg-brand-500/5 blur-[100px] rounded-full" />
            <h2 className="text-4xl font-black uppercase tracking-tighter italic mb-4">Want to <span className="text-brand-500">Join</span> Us?</h2>
            <p className="text-gray-500 font-bold text-[10px] uppercase tracking-widest mb-10">We are always looking for passionate creators and sports lovers.</p>
            <button className="bg-white text-black px-10 py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-brand-500 hover:text-white transition-all shadow-glow-white hover:shadow-glow-orange">
               Send Your CV
            </button>
         </motion.div>
      </section>
    </div>
  );
};

export default ManagementPage;
