
require("dotenv").config();

const connectDB = require("./config/db");
const Player = require("./models/Player");

const players = [
  {
    name: "Lovekush",
    fullName: "Kumar handsome cute Nisha",
     
    team: "Avengenius Warrior",
    role: "Batsman",
    battingStyle: "Right-hand bat",
    bowlingStyle: "Right arm off spin",
    bio: "Captain",
    isFeatured: true,
    isCaptain: true
  },
  {
    name: "Rahul kumar",
    fullName: "Rocky",

    team: "Avengenius Warrior",
    role: "All-Rounder",
    battingStyle: "Right hand bat",
    bowlingStyle: "Left hand",
    isViceCaptain: true
  },
  {
    name: "Mohan singh",
    fullName: "Mohan chaaya handsome winner",
     
    team: "The CrickTitans",
    role: "Bowler",
    battingStyle: "Right hand",
    bowlingStyle: "Right hand fast",
    isCaptain: true
  },
  {
    name: "Mohit baghel",
     
    team: "Blazing Panthers",
    role: "Bowler",
    isCaptain: true
  },
  {
    name: "Kartik Baghel",
    fullName: "KK",
     
    team: "THE CRICKSTERS",
    role: "Batsman",
    isCaptain: true
  },
  {
    name: "Vikash",
    fullName: "Vikash moose wallah",
     
    team: "The Iron Eagles",
    role: "Batsman",
    isCaptain: true
  }
];

async function seedPlayers() {
  try {
    // Ensure database connection before seeding
    await connectDB();

    await Player.deleteMany();

    await Player.insertMany(players);

    console.log("✅ Players inserted successfully");

    process.exit();
  } catch (err) {
    console.log("❌ Error:", err);
    process.exit(1);
  }
}

seedPlayers();