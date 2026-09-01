// server/middleware/validation.js

/**
 * Validate tournament ID existence and format
 */
exports.validateTournamentId = async (req, res, next) => {
  const mongoose = require("mongoose");
  const { Tournament } = require("../models/other");

  const tournamentId = req.params.id || req.body.tournament;

  if (!tournamentId) {
    return res.status(400).json({ success: false, message: "Tournament ID required" });
  }

  if (!mongoose.Types.ObjectId.isValid(tournamentId)) {
    return res.status(400).json({ success: false, message: "Invalid tournament ID format" });
  }

  try {
    const tournament = await Tournament.findById(tournamentId);
    if (!tournament) {
      return res.status(404).json({ success: false, message: "Tournament not found" });
    }
    req.tournament = tournament;
    next();
  } catch (err) {
    res.status(500).json({ success: false, message: "Error validating tournament" });
  }
};

/**
 * Validate match ID existence and format
 */
exports.validateMatchId = async (req, res, next) => {
  const mongoose = require("mongoose");
  const Match = require("../models/Match");

  const matchId = req.params.id || req.params.matchId;

  if (!matchId) {
    return res.status(400).json({ success: false, message: "Match ID required" });
  }

  if (!mongoose.Types.ObjectId.isValid(matchId)) {
    return res.status(400).json({ success: false, message: "Invalid match ID format" });
  }

  try {
    const match = await Match.findById(matchId);
    if (!match) {
      return res.status(404).json({ success: false, message: "Match not found" });
    }
    req.match = match;
    next();
  } catch (err) {
    res.status(500).json({ success: false, message: "Error validating match" });
  }
};

/**
 * Prevent concurrent updates on the same resource
 */
const updateLocks = new Map();

exports.acquireLock = (resourceId, timeout = 30000) => {
  return new Promise((resolve, reject) => {
    if (updateLocks.has(resourceId)) {
      return reject(new Error("Resource is being updated. Please try again."));
    }

    const timer = setTimeout(() => {
      updateLocks.delete(resourceId);
    }, timeout);
    timer.unref?.();
    updateLocks.set(resourceId, timer);

    resolve();
  });
};

exports.releaseLock = (resourceId) => {
  const timer = updateLocks.get(resourceId);
  if (timer) clearTimeout(timer);
  updateLocks.delete(resourceId);
};

/**
 * Middleware to prevent concurrent updates
 */
exports.preventConcurrentUpdates = async (req, res, next) => {
  const resourceId = req.params.id || req.params.matchId;

  if (!resourceId) {
    return next();
  }

  try {
    await exports.acquireLock(resourceId);
    
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      exports.releaseLock(resourceId);
    };
    res.once("finish", release);
    res.once("close", release);

    next();
  } catch (err) {
    res.status(409).json({ success: false, message: err.message });
  }
};

/**
 * Validate request payload size
 */
exports.validatePayloadSize = (req, res, next) => {
  // Multipart image uploads are mounted at /api/upload. Multer applies the
  // stricter 5 MiB file limit; this small allowance covers multipart headers.
  const maxSize = req.path.startsWith("/api/upload/") ? 6 * 1024 * 1024 : 1024 * 1024;
  if (Number(req.headers["content-length"] || 0) > maxSize) {
    return res.status(413).json({ success: false, message: "Payload too large" });
  }
  next();
};

/**
 * Sanitize and validate user input
 */
exports.sanitizeInput = (req, res, next) => {
  const forbiddenKeys = new Set(["__proto__", "prototype", "constructor"]);
  const preserveWhitespace = new Set(["password", "setupsecret", "secret", "token", "key"]);
  let visited = 0;
  const sanitize = (obj, depth = 0, field = "") => {
    visited += 1;
    if (visited > 10000 || depth > 12) throw new Error("Payload nesting is too deep");
    if (typeof obj === "string") {
      const normalizedField = String(field).toLowerCase();
      const maxLength = normalizedField === "content" ? 100000 : 10000;
      if (obj.length > maxLength) throw new Error(`${field || "String"} is too long`);
      return preserveWhitespace.has(normalizedField) ? obj : obj.trim();
    }
    if (typeof obj !== "object" || obj === null) return obj;
    const output = Array.isArray(obj) ? [] : Object.create(null);
    for (const key of Object.keys(obj)) {
      if (forbiddenKeys.has(key)) throw new Error("Unsafe object key in payload");
      output[key] = sanitize(obj[key], depth + 1, key);
    }
    return output;
  };

  try {
    req.body = sanitize(req.body);
    req.query = sanitize(req.query);
    req.params = sanitize(req.params);
    next();
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
