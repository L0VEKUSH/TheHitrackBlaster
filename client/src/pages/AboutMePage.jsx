import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaGithub, FaLinkedin, FaInstagram, FaCode, FaGamepad, FaMusic, FaLock,
  FaHeart, FaPlus, FaArrowLeft, FaArrowRight, FaTimes, FaGift,
  FaRegSmileBeam, FaRegFrownOpen
} from "react-icons/fa";
import { GiCricketBat } from "react-icons/gi";
import { authAPI, aboutMeAPI } from "../services/api";

function SecretCard({ item }) {
  const [showGate, setShowGate] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [showStory, setShowStory] = useState(false);
  const [showProposal, setShowProposal] = useState(false);
  const [noCount, setNoCount] = useState(0);
  const [yesPressed, setYesPressed] = useState(false);
  const [noButtonPos, setNoButtonPos] = useState({ x: 0, y: 0 });
  const [currentPanel, setCurrentPanel] = useState(0);
  const [pass, setPass] = useState("");
  const [error, setError] = useState(false);

  const resetLock = () => {
    setUnlocked(false);
    setShowGate(false);
    setPass("");
    setShowStory(false);
    setShowProposal(false);
    setNoCount(0);
    setYesPressed(false);
  };

  const [dynamicPanels, setDynamicPanels] = useState([
    {
      img: "/images/lish/panel1.png",
      text: "Every journey has a beginning, but mine truly started the moment I saw you. I still love you, and I will love you forever.",
      caption: "Chapter 1: The Beginning"
    },
    {
      img: "/images/lish/panel2.png",
      text: "I kept remembering you and it became my greatest strength. In the silence, your memory fuels my dreams.",
      caption: "Chapter 2: The Journey"
    },
    {
      img: "/images/lish/panel3.png",
      text: "You aren't just a part of my life; you are the soul of everything I build. My soul belongs to you, always.",
      caption: "Chapter 3: Forever"
    }
  ]);

  // Persistence for Story Panels
  useEffect(() => {
    const saved = localStorage.getItem("lish_story_panels");
    if (saved) {
      try {
        setDynamicPanels(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load story panels", e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("lish_story_panels", JSON.stringify(dynamicPanels));
  }, [dynamicPanels]);

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setDynamicPanels(prev => [...prev, {
          img: reader.result,
          text: "A new memory added to our journey...",
          caption: `Chapter ${prev.length + 1}`
        }]);
      };
      reader.readAsDataURL(file);
    }
  };

  const comicPanels = dynamicPanels;

  const nextPanel = () => setCurrentPanel((prev) => (prev + 1) % comicPanels.length);
  const prevPanel = () => setCurrentPanel((prev) => (prev - 1 + comicPanels.length) % comicPanels.length);

  const checkPass = async (e) => {
    e.preventDefault();
    try {
      const { data } = await authAPI.unlockAboutMe({ key: pass });
      if (data?.success && data?.unlocked) {
        setUnlocked(true);
        if (item.isGift) setShowProposal(true);
      } else {
        throw new Error("Unlock failed");
      }
    } catch (err) {
      setError(true);
      setTimeout(() => setError(false), 2000);
    }
  };

  const getNoButtonText = () => {
    const phrases = [
      "No", "Are you sure?", "Really sure?", "Think again!",
       "Have a heart!",
      "You're breaking my heart ;(",
      "I will take care of you , i promise ❤️",
      "I will always love you ❤️",
      "I will protect you from everything ❤️",
      "I will support you in every step of your life ❤️",
      "I promise that we will have a happy life together❤️",
      "I will make you happy❤️, forever ❤️",
      "I will never leave you ❤️",
      "You are my everything ❤️",
      "I just want to spend the rest of my life with you ❤️",
      "Please say yes ❤️"
    ];
    return phrases[Math.min(noCount, phrases.length - 1)];
  };

  const handleNoClick = () => {
    setNoCount(noCount + 1);
    setNoButtonPos({
      x: Math.random() * 200 - 100,
      y: Math.random() * 200 - 100
    });
  };

  // 1. Initial "Simple" State (Stealth)
  if (item.isSecret && !unlocked && !showGate) {
    return (
      <motion.div
        whileHover={{ y: -10 }}
        onClick={() => setShowGate(true)}
        className="p-10 rounded-[2.5rem] bg-white/5 border border-white/10 space-y-6 group hover:bg-brand-500/10 transition-all cursor-pointer shadow-premium"
      >
        <div className="w-16 h-16 rounded-2xl bg-brand-500/20 text-brand-500 flex items-center justify-center text-3xl group-hover:bg-brand-500 group-hover:text-white transition-all">
          <FaGamepad />
        </div>
        <h3 className="text-2xl font-black uppercase tracking-tighter italic text-white">lish</h3>
        <p className="text-gray-500 font-bold text-sm leading-relaxed uppercase tracking-widest">
          The inspiration behind my journey.
        </p>
      </motion.div>
    );
  }

  // 2. Password Gate State
  if ((item.isSecret || item.isGift) && !unlocked && showGate) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`p-10 rounded-[2.5rem] bg-gray-900 border-2 ${item.isGift ? 'border-pink-500/50' : 'border-brand-500/50'} flex flex-col items-center justify-center space-y-6 text-center relative group`}
      >
        <div className={`w-16 h-16 rounded-2xl ${item.isGift ? 'bg-pink-500/10 text-pink-500' : 'bg-brand-500/10 text-brand-500'} flex items-center justify-center text-2xl`}>
          <FaLock className={error ? "animate-bounce" : ""} />
        </div>
        <form onSubmit={checkPass} className="w-full space-y-4">
          <input
            type="password"
            autoFocus
            placeholder="Enter Key..."
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            className={`w-full bg-black/60 border ${error ? 'border-red-500' : 'border-white/20'} rounded-2xl px-6 py-4 text-sm text-center focus:outline-none focus:border-brand-500 transition-all text-white font-bold`}
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowGate(false)} className="flex-1 text-[9px] font-black uppercase tracking-widest text-gray-500 hover:text-white transition-colors">
              Cancel
            </button>
            <button type="submit" className={`flex-2 ${item.isGift ? 'bg-pink-500 shadow-glow-pink' : 'bg-brand-500 shadow-glow-orange'} text-white text-[10px] font-black uppercase tracking-widest px-6 py-3 rounded-xl hover:scale-105 transition-all`}>
              Unlock
            </button>
          </div>
        </form>
      </motion.div>
    );
  }

  // 3. Unlocked "Interactive" State (Lish)
  if (item.isSecret && unlocked) {
    return (
      <div className="relative group">
        {/* Floating Heart Particles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          {[...Array(8)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 100, x: Math.random() * 200 - 100 }}
              animate={{ opacity: [0, 1, 0], y: -200, x: (Math.random() * 200 - 100) }}
              transition={{ duration: 4 + Math.random() * 2, repeat: Infinity, delay: i * 0.5 }}
              className="absolute bottom-0 left-1/2 text-red-500/40 text-xl"
            >
              ❤️
            </motion.div>
          ))}
        </div>

        <motion.div
          whileHover={{ y: -10, scale: 1.02 }}
          onClick={() => setShowStory(true)}
          className="p-10 rounded-[2.5rem] bg-gradient-to-br from-brand-600/20 to-pink-600/20 border-2 border-brand-500/50 space-y-6 group hover:shadow-glow-orange transition-all cursor-pointer relative z-10 overflow-hidden h-full flex flex-col justify-end"
        >
          {/* Subtle Parallax Background Image */}
          <div className="absolute inset-0 opacity-10 group-hover:opacity-30 transition-opacity">
            <img src="/images/lish/panel3.png" className="w-full h-full object-cover scale-150 grayscale group-hover:grayscale-0 transition-all duration-700" alt="" />
          </div>

          <div className="relative z-20 space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-brand-500 text-white flex items-center justify-center text-3xl shadow-glow-orange animate-pulse">
              <FaHeart />
            </div>
            <h3 className="text-2xl font-black uppercase tracking-tighter italic">Lish</h3>
            <div className="flex items-center gap-4">
              <p className="text-brand-400 font-black text-[10px] uppercase tracking-widest animate-bounce">
                View Our Anime Story
              </p>
              <label className="bg-white/10 hover:bg-brand-500 text-white p-2 rounded-xl border border-white/10 transition-all cursor-pointer">
                <FaPlus size={12} />
                <input type="file" className="hidden" accept="image/*" onChange={handleImport} />
              </label>
            </div>
          </div>
        </motion.div>

        {/* Modal: Manga Story Viewer */}
        <AnimatePresence>
          {showStory && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[999] bg-black/95 backdrop-blur-2xl flex items-center justify-center p-6"
            >
              <div className="max-w-6xl w-full h-[85vh] bg-gray-950 rounded-[4rem] overflow-hidden border-4 border-white/10 flex flex-col md:flex-row relative shadow-premium">

                {/* Manga Gutter/Border */}
                <div className="absolute top-0 bottom-0 left-0 w-2 bg-brand-500 z-50 hidden md:block" />
                <div className="absolute top-0 bottom-0 right-0 w-2 bg-brand-500 z-50 hidden md:block" />

                {/* Left Side: Illustration Panel */}
                <div className="flex-1 relative overflow-hidden group bg-gray-900">
                  {/* Romantic Petals Effect */}
                  <div className="absolute inset-0 pointer-events-none z-20">
                    {[...Array(10)].map((_, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: -20, x: Math.random() * 100 + "%" }}
                        animate={{
                          opacity: [0, 1, 0],
                          y: ["0%", "120%"],
                          x: [Math.random() * 100 + "%", (Math.random() * 100 - 20) + "%"],
                          rotate: [0, 360]
                        }}
                        transition={{ duration: 5 + Math.random() * 5, repeat: Infinity, delay: i * 1 }}
                        className="absolute text-pink-400/20 text-sm"
                      >
                        🌸
                      </motion.div>
                    ))}
                  </div>

                  <AnimatePresence mode="wait">
                    <motion.div
                      key={currentPanel}
                      initial={{ opacity: 0, scale: 1.2, filter: "blur(10px)" }}
                      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                      exit={{ opacity: 0, scale: 0.8, filter: "blur(10px)" }}
                      transition={{ duration: 1.2, ease: "circOut" }}
                      className="absolute inset-0"
                    >
                      <img
                        src={comicPanels[currentPanel].img}
                        className={`w-full h-full object-cover transition-all duration-1000 ${currentPanel === 0
                          ? "scale-[1.5] translate-y-[5%] grayscale group-hover:grayscale-0 brightness-75 group-hover:brightness-100"
                          : "grayscale brightness-75 group-hover:grayscale-0"
                          }`}
                        alt="Comic Panel"
                        onError={(e) => {
                          e.target.src = "https://images.unsplash.com/photo-1578632292335-df3abbb0d586?q=80&w=1974&auto=format&fit=crop";
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
                    </motion.div>
                  </AnimatePresence>

                  {/* SFX Label */}
                  <div className="absolute top-12 left-12 rotate-[-15deg] bg-white text-black px-4 py-2 font-black italic text-2xl uppercase tracking-tighter shadow-glow-white">
                    *Thump*
                  </div>

                  {/* Chapter Caption Box */}
                  <div className="absolute bottom-12 left-12 rotate-[2deg] bg-brand-500 text-white px-6 py-3 font-black uppercase tracking-widest text-xs skew-x-[-10deg]">
                    {comicPanels[currentPanel].caption}
                  </div>
                </div>

                {/* Right Side: Narrative & Controls */}
                <div className="w-full md:w-[450px] p-12 flex flex-col justify-center space-y-12 bg-gray-950 border-l border-white/10 relative">
                  <div className="space-y-6">
                    <div className="w-1 h-20 bg-brand-500/50 rounded-full mx-auto md:mx-0 mb-8" />
                    <AnimatePresence mode="wait">
                      <motion.p
                        key={currentPanel}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="text-2xl md:text-3xl font-black text-white italic uppercase tracking-tighter leading-tight"
                      >
                        "{comicPanels[currentPanel].text}"
                      </motion.p>
                    </AnimatePresence>
                  </div>

                  <div className="flex items-center gap-6">
                    <button onClick={prevPanel} className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-brand-500 transition-all text-white"><FaArrowLeft /></button>
                    <div className="flex-1 h-1 bg-white/10 rounded-full relative overflow-hidden">
                      <motion.div className="absolute inset-y-0 left-0 bg-brand-500" animate={{ width: `${((currentPanel + 1) / comicPanels.length) * 100}%` }} />
                    </div>
                    <button onClick={nextPanel} className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-brand-500 transition-all text-white"><FaArrowRight /></button>
                  </div>

                  <button onClick={resetLock} className="absolute top-8 right-8 text-gray-500 hover:text-white transition-colors"><FaTimes size={24} /></button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // 4. Gift Card State
  if (item.isGift) {
    return (
      <div className="relative group h-full">
        <motion.div
          whileHover={{ y: -10, scale: 1.05 }}
          onClick={() => unlocked ? setShowProposal(true) : setShowGate(true)}
          className="p-10 rounded-[2.5rem] bg-gradient-to-br from-pink-500/20 to-brand-500/20 border-2 border-pink-500/30 space-y-6 group hover:shadow-glow-pink transition-all cursor-pointer relative z-10 overflow-hidden h-full flex flex-col items-center justify-center text-center shadow-premium"
        >
          <div className="w-16 h-16 rounded-2xl bg-pink-500 text-white flex items-center justify-center text-3xl shadow-glow-pink animate-bounce">
            <FaGift />
          </div>
          <h3 className="text-2xl font-black uppercase tracking-tighter italic text-pink-400">Gift</h3>
          <p className="text-gray-400 font-bold text-[10px] uppercase tracking-widest">Unwrap your surprise</p>
        </motion.div>

        {/* Proposal Modal */}
        <AnimatePresence>
          {showProposal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[1000] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6"
            >
              <motion.div
                initial={{ scale: 0.8, y: 50 }}
                animate={{ scale: 1, y: 0 }}
                className="max-w-md w-full bg-gray-900 rounded-[3rem] p-10 border border-white/10 text-center relative overflow-hidden shadow-2xl"
              >
                {yesPressed ? (
                  <div className="space-y-6 py-10">
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-8xl">💍</motion.div>
                    <h2 className="text-4xl font-black uppercase tracking-tighter italic text-brand-500">I Knew You'd Say Yes!</h2>
                    <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">You've made me the happiest person alive.</p>
                    <button onClick={resetLock} className="mt-8 bg-brand-500 text-white px-8 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px]">Close</button>
                  </div>
                ) : (
                  <div className="space-y-8">
                    <div className="relative">
                      <motion.div animate={noCount > 0 ? { y: [0, -10, 0] } : {}} className="text-7xl mb-4">
                        {noCount > 10 ? "😭" : noCount > 5 ? "🥺" : "🤵‍♂️"}
                      </motion.div>
                    </div>
                    <h2 className="text-3xl font-black uppercase tracking-tighter italic">Will you be mine <br /> <span className="text-brand-500">forever?</span></h2>
                    <div className="flex items-center justify-center gap-4 mt-10 relative h-20">
                      <button
                        onClick={() => setYesPressed(true)}
                        style={{ fontSize: Math.min(14 + noCount * 4, 40) + "px" }}
                        className="bg-brand-500 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest transition-all shadow-glow-orange z-50"
                      >
                        Yes
                      </button>
                      <motion.button
                        animate={{ x: noButtonPos.x, y: noButtonPos.y }}
                        onClick={handleNoClick}
                        className="bg-white/5 border border-white/10 text-gray-400 px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-red-500/20"
                      >
                        {getNoButtonText()}
                      </motion.button>
                    </div>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-8">
                      {noCount > 5 ? "Please don't break my heart..." : "Think carefully..."}
                    </p>
                  </div>
                )}
                <button onClick={resetLock} className="absolute top-6 right-6 text-gray-600 hover:text-white"><FaTimes size={20} /></button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // 5. Normal State
  return (
    <motion.div
      whileHover={{ y: -10 }}
      className="p-10 rounded-[2.5rem] bg-white/5 border border-white/10 space-y-6 group hover:bg-brand-500/10 transition-all shadow-premium h-full"
    >
      <div className="w-16 h-16 rounded-2xl bg-brand-500/20 text-brand-500 flex items-center justify-center text-3xl group-hover:bg-brand-500 group-hover:text-white transition-all">
        {item.icon}
      </div>
      <h3 className="text-2xl font-black uppercase tracking-tighter italic text-white">{item.title}</h3>
      <p className="text-gray-500 font-bold text-sm leading-relaxed uppercase tracking-widest">{item.desc}</p>
    </motion.div>
  );
}

export default function AboutMePage() {
  const defaultPageData = {
    heroTitle: "I AM",
    heroName: "LOVEKUSH",
    heroSubtitle: "Developer • Visionary • Sports Enthusiast",
    photo: "",
    socialLinks: {
      github: "",
      instagram: "",
      linkedin: ""
    },
    storyHeading: "Building the Future of Sports Tracking",
    storyParagraphs: [
      "Hi, I'm Lovekush, the mind behind The Hitrack. My journey started with a simple passion for sports and a drive to create something that brings fans closer to the game. I believe that technology should be as exciting as the sport itself.",
      "When I'm not crafting cinematic web interfaces or building real-time scoring engines, you can find me analyzing match tactics, exploring new tech stacks, or pushing the boundaries of what's possible in web development."
    ],
    stats: [
      { label: "Code Commits", value: "500+" },
      { label: "Projects Built", value: "12+" },
      { label: "Matches Scored", value: "100+" }
    ],
    lifestyle: [
      { title: "Pure Innovation", desc: "Always looking for the 'next big thing' in UI/UX and real-time data.", icon: "code" },
      { title: "Sports DNA", desc: "A lifelong fan of high-intensity sports, from Cricket to Kabaddi.", icon: "bat" },
      { title: "Creative Flow", desc: "Believing that code is an art form that should wow the user.", icon: "music" },
      { title: "Lish", desc: "The inspiration and anime love that drives my creative journey and pursuit of excellence.", icon: "heart" }
    ],
    quoteText: "Building technology is like playing a match—you need precision, team spirit, and the hunger to win.",
    quoteAuthor: "— Lovekush"
  };

  const [pageData, setPageData] = useState(defaultPageData);

  useEffect(() => {
    const loadAboutMe = async () => {
      try {
        const { data } = await aboutMeAPI.get();
        if (data.success && data.data) {
          setPageData((prev) => ({ ...prev, ...data.data }));
        }
      } catch (err) {
        console.error("Failed to load About Me content", err);
      }
    };
    loadAboutMe();
  }, []);

  const stats = pageData.stats;
  const lifestyle = pageData.lifestyle;

  const iconMap = {
    code: <FaCode />,
    bat: <GiCricketBat />,
    music: <FaMusic />,
    heart: <span className="text-red-500">❤️</span>
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white pb-20 overflow-hidden">
      {/* Hero Section */}
      <div className="relative h-[500px] flex items-center justify-center">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-b from-brand-600/20 via-gray-950/80 to-gray-950 z-10" />
          <img
            src="https://images.unsplash.com/photo-1517694712202-14dd9538aa97?q=80&w=2070&auto=format&fit=crop"
            className="w-full h-full object-cover opacity-30 grayscale"
            alt="Workspace"
          />
        </div>

        <div className="relative z-20 text-center space-y-6 px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-32 h-32 mx-auto rounded-[2.5rem] bg-gradient-to-br from-brand-500 to-accent-500 p-1 shadow-glow-orange mb-8 rotate-3 hover:rotate-0 transition-transform duration-500"
          >
            <div className="w-full h-full bg-gray-900 rounded-[2.3rem] flex items-center justify-center overflow-hidden">
              {pageData.photo ? (
                <img src={pageData.photo} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <span className="text-5xl font-black text-brand-500">L</span>
              )}
            </div>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-6xl md:text-8xl font-black uppercase tracking-tighter italic leading-none"
          >
            {pageData.heroTitle} <span className="text-brand-500">{pageData.heroName}</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-gray-400 max-w-xl mx-auto font-bold text-sm uppercase tracking-[0.4em] leading-relaxed"
          >
            {pageData.heroSubtitle}
          </motion.p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 space-y-32">
        {/* Personal Story */}
        <section className="grid lg:grid-cols-2 gap-20 items-center">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="space-y-8"
          >
            <div className="text-brand-500 font-black text-xs uppercase tracking-[0.5em]">The Journey</div>
            <h2 className="text-5xl font-black uppercase tracking-tighter italic">{pageData.storyHeading}</h2>
            {pageData.storyParagraphs.map((paragraph, idx) => (
              <p key={idx} className="text-gray-400 font-medium leading-relaxed text-lg">
                {paragraph}
              </p>
            ))}
            <div className="flex gap-6 pt-4">
              {pageData.socialLinks.github && (
                <a href={pageData.socialLinks.github} target="_blank" rel="noreferrer" className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center hover:bg-brand-500 transition-all text-xl border border-white/10">
                  <FaGithub />
                </a>
              )}
              {pageData.socialLinks.linkedin && (
                <a href={pageData.socialLinks.linkedin} target="_blank" rel="noreferrer" className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center hover:bg-brand-500 transition-all text-xl border border-white/10">
                  <FaLinkedin />
                </a>
              )}
              {pageData.socialLinks.instagram && (
                <a href={pageData.socialLinks.instagram} target="_blank" rel="noreferrer" className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center hover:bg-brand-500 transition-all text-xl border border-white/10">
                  <FaInstagram />
                </a>
              )}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="grid grid-cols-2 gap-6"
          >
            {stats.map((s, i) => (
              <div key={i} className={`card p-8 bg-gray-900 border-white/5 flex flex-col items-center text-center space-y-4 ${i === 0 ? 'col-span-2' : ''}`}>
                <div className="text-3xl text-brand-500">
                  {i === 0 ? <FaCode /> : i === 1 ? <GiCricketBat /> : <FaGamepad />}
                </div>
                <div>
                  <div className="text-4xl font-black text-white font-mono">{s.value}</div>
                  <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest mt-1">{s.label}</div>
                </div>
              </div>
            ))}
          </motion.div>
        </section>

        {/* Interests & Lifestyle */}
        <section className="space-y-12">
          <div className="text-center">
            <div className="text-brand-500 font-black text-xs uppercase tracking-[0.5em] mb-4">Lifestyle</div>
            <h2 className="text-5xl font-black uppercase tracking-tighter italic">What Drives Me</h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {lifestyle.slice(0, 4).map((item, i) => (
              <div key={i} className="rounded-[2.5rem] bg-white/5 border border-white/10 p-8 space-y-4 text-center shadow-premium">
                <div className="text-3xl text-brand-500">
                  {iconMap[item.icon] ?? <FaCode />}
                </div>
                <h3 className="text-xl font-black uppercase tracking-tighter">{item.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
            <SecretCard key="secret" item={{
              title: "Lish",
              desc: "The inspiration and anime love that drives my creative journey and pursuit of excellence.",
              icon: <span className="text-red-500">❤️</span>,
              isSecret: true
            }} />
            <SecretCard key="gift" item={{
              title: "Gift",
              desc: "A small surprise waiting to be unwrapped.",
              icon: <FaGift className="text-pink-500" />,
              isGift: true
            }} />
          </div>
        </section>

        {/* Quote Section */}
        <section className="relative py-20 rounded-[4rem] overflow-hidden bg-brand-500 text-center px-10 shadow-glow-orange">
          <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10" />
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            className="relative z-10"
          >
            <span className="text-8xl font-serif text-black/20 block leading-none">"</span>
            <h2 className="text-3xl md:text-5xl font-black text-gray-950 uppercase tracking-tighter italic max-w-4xl mx-auto leading-tight">
              {pageData.quoteText}
            </h2>
            <div className="mt-8 text-sm font-black text-white uppercase tracking-[0.4em]">{pageData.quoteAuthor}</div>
          </motion.div>
        </section>
      </div>
    </div>
  );
}
