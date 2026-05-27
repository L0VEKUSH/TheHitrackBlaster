import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getRandomReaction } from "./reactionData";

export const DualCaptain = ({ event }) => {
  const [visible, setVisible] = useState(false);
  const [reactions, setReactions] = useState({ batting: "", bowling: "" });

  useEffect(() => {
    if (event) {
      setReactions({
        batting: getRandomReaction(event.type, "batting"),
        bowling: getRandomReaction(event.type, "bowling")
      });
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), 3500);
      return () => clearTimeout(timer);
    }
  }, [event]);

  if (!event) return null;

  return (
    <div className="fixed inset-x-0 top-1/4 pointer-events-none z-50 flex justify-between px-4 md:px-20">
      <AnimatePresence>
        {visible && (
          <>
            {/* Batting Captain */}
            <motion.div
              initial={{ x: -100, opacity: 0, scale: 0.8 }}
              animate={{ x: 0, opacity: 1, scale: 1 }}
              exit={{ x: -100, opacity: 0, scale: 0.8 }}
              className="flex flex-col items-center"
            >
              <div className="relative">
                <img 
                  src="/assets/batting_captain.png" 
                  alt="Batting Captain" 
                  className="w-24 h-24 md:w-32 md:h-32 rounded-full border-4 border-blue-500 shadow-lg shadow-blue-500/50 object-cover bg-gray-900"
                />
                <motion.div 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-4 -right-4 bg-white text-black text-xs font-bold px-2 py-1 rounded-lg border-2 border-blue-500 shadow-sm"
                >
                  BAT CAPTAIN
                </motion.div>
              </div>
              <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="mt-4 bg-gray-900/90 backdrop-blur-md border border-blue-500/30 text-white px-4 py-2 rounded-2xl max-w-[200px] text-center text-sm font-medium shadow-xl"
              >
                {reactions.batting}
              </motion.div>
            </motion.div>

            {/* Bowling Captain */}
            <motion.div
              initial={{ x: 100, opacity: 0, scale: 0.8 }}
              animate={{ x: 0, opacity: 1, scale: 1 }}
              exit={{ x: 100, opacity: 0, scale: 0.8 }}
              className="flex flex-col items-center"
            >
              <div className="relative">
                <img 
                  src="/assets/bowling_captain.png" 
                  alt="Bowling Captain" 
                  className="w-24 h-24 md:w-32 md:h-32 rounded-full border-4 border-red-500 shadow-lg shadow-red-500/50 object-cover bg-gray-900"
                />
                <motion.div 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-4 -left-4 bg-white text-black text-xs font-bold px-2 py-1 rounded-lg border-2 border-red-500 shadow-sm"
                >
                  BOWL CAPTAIN
                </motion.div>
              </div>
              <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="mt-4 bg-gray-900/90 backdrop-blur-md border border-red-500/30 text-white px-4 py-2 rounded-2xl max-w-[200px] text-center text-sm font-medium shadow-xl"
              >
                {reactions.bowling}
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
