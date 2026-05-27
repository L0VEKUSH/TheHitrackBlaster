import React from "react";
import { useHype } from "./HypeContext";
import { motion } from "framer-motion";

export const HypeToggle = () => {
  const { isHypeMode, toggleHypeMode } = useHype();

  return (
    <button
      onClick={toggleHypeMode}
      className={`relative flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-500 overflow-hidden ${
        isHypeMode 
          ? "bg-gradient-to-r from-orange-500 via-red-500 to-purple-600 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)]" 
          : "bg-gray-800 text-gray-400"
      }`}
    >
      <motion.div
        animate={{ 
          rotate: isHypeMode ? [0, 10, -10, 0] : 0,
          scale: isHypeMode ? [1, 1.2, 1] : 1
        }}
        transition={{ repeat: isHypeMode ? Infinity : 0, duration: 2 }}
      >
        {isHypeMode ? "🔥" : "✨"}
      </motion.div>
      <span className="text-xs font-bold uppercase tracking-widest">
        {isHypeMode ? "Hype Mode ON" : "Normal Mode"}
      </span>
      
      {isHypeMode && (
        <motion.div
          className="absolute inset-0 bg-white/20"
          initial={{ x: "-100%" }}
          animate={{ x: "200%" }}
          transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
        />
      )}
    </button>
  );
};
