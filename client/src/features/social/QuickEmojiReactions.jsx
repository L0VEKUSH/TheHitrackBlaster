import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const EMOJIS = ["🔥", "😂", "😭", "😱", "👏", "🐐"];

export const QuickEmojiReactions = () => {
  const [reactions, setReactions] = useState([]);

  const addReaction = (emoji) => {
    const id = Date.now();
    setReactions(prev => [...prev, { id, emoji, x: Math.random() * 100 - 50 }]);
    setTimeout(() => {
      setReactions(prev => prev.filter(r => r.id !== id));
    }, 2000);
  };

  return (
    <div className="relative">
      <div className="flex gap-2 p-2 bg-gray-900/80 backdrop-blur-md rounded-full border border-white/10 shadow-2xl">
        {EMOJIS.map(emoji => (
          <button
            key={emoji}
            onClick={() => addReaction(emoji)}
            className="text-xl hover:scale-125 transition-transform active:scale-95"
          >
            {emoji}
          </button>
        ))}
      </div>

      <div className="absolute bottom-full left-1/2 -translate-x-1/2 pointer-events-none mb-4">
        <AnimatePresence>
          {reactions.map(r => (
            <motion.div
              key={r.id}
              initial={{ y: 0, opacity: 1, scale: 0.5, x: r.x }}
              animate={{ y: -200, opacity: 0, scale: 2, x: r.x + (Math.random() * 50 - 25) }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.5, ease: "easeOut" }}
              className="absolute text-3xl"
            >
              {r.emoji}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};
