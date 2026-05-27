// src/features/captain/reactionData.js

export const REACTIONS = {
  SIX: {
    batting: [
      "Absolute cinema! 🎬",
      "That's out of the stadium! 🚀",
      "Calculated. 😎",
      "Built different. 😤",
      "Sheeeeesh! 🔥",
      "Easy work. 💅"
    ],
    bowling: [
      "Pain. Just pain. 💀",
      "Where was the line? 🤡",
      "Bruh moment. 🤦‍♂️",
      "Can we restart? 🎮",
      "I'm lagging. 📶",
      "That's illegal. 🚫"
    ]
  },
  WICKET: {
    batting: [
      "My controller disconnected! 🎮",
      "Unlucky. 🫠",
      "I was just warming up. 😤",
      "Check the bat, it's broken. 🔨",
      "GGs only. 📉",
      "Rigged. 🤨"
    ],
    bowling: [
      "Pack your bags! 🎒",
      "Sit down. 🪑",
      "I'm the GOAT. 🐐",
      "Ez clap. 👏",
      "Calculated. 🧠",
      "Don't come back. 👋"
    ]
  },
  FOUR: {
    batting: [
      "Timing > Power. ✨",
      "Pure class. 🎩",
      "Keep 'em coming. 💸"
    ],
    bowling: [
      "Could be worse. 😮‍💨",
      "Focus up! 🎯",
      "Mid. 🙄"
    ]
  }
};

export const getRandomReaction = (event, side) => {
  const options = REACTIONS[event]?.[side] || ["..."];
  return options[Math.floor(Math.random() * options.length)];
};
