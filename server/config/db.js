const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const uri = process.env.MONGO_URI;

    if (!uri) {
      throw new Error("MONGO_URI environment variable is not set");
    }

    if (!/^mongodb(\+srv)?:\/\//.test(uri)) {
      throw new Error("Invalid MONGO_URI scheme, expected mongodb:// or mongodb+srv://");
    }

    const conn = await mongoose.connect(uri);
    console.log(`✅ MongoDB: ${conn.connection.host}`);
  } catch (err) {
    console.error("❌ DB Error:", err.message);
    // Let the caller handle retries and exiting. Rethrow the error so
    // higher-level logic (with retry) can decide when to exit.
    throw err;
  }
};

module.exports = connectDB;
