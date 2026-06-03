// server/middleware/validation.js

/**
 * Validate match score update to prevent invalid cricket data
 */
exports.validateScoreUpdate = (req, res, next) => {
  const body = req.body || {};

  // Backward-compatible contract: some clients send { action, data }
  if (body.action) {
    const { action, data } = body;

    try {
      switch (action) {
        case "runs": {
          if (typeof data?.runs !== "number" || data.runs < 0 || data.runs > 6) {
            return res.status(400).json({ success: false, message: "Runs must be 0-6" });
          }
          if (typeof data?.wicket !== "boolean") {
            return res.status(400).json({ success: false, message: "Wicket flag required" });
          }
          break;
        }

        case "wicket": {
          if (!data?.batsmanName || !data?.bowlerName || !data?.dismissalType) {
            return res.status(400).json({ success: false, message: "Wicket details incomplete" });
          }
          break;
        }

        case "extras": {
          if (!["wide", "no-ball", "bye", "leg-bye"].includes(data?.type)) {
            return res.status(400).json({ success: false, message: "Invalid extra type" });
          }
          if (typeof data?.runs !== "number" || data.runs < 0) {
            return res.status(400).json({ success: false, message: "Invalid extra runs" });
          }
          break;
        }

        case "completedMatch": {
          if (!data?.result || typeof data.result !== "string") {
            return res.status(400).json({ success: false, message: "Match result required" });
          }
          break;
        }

        default:
          return res.status(400).json({ success: false, message: "Unknown action" });
      }

      return next();
    } catch {
      return res.status(400).json({ success: false, message: "Invalid request data" });
    }
  }

  // New contract (used by AdminLiveScoring.jsx): flat score payload.
  // Required core fields
  const { inningsNum, runs, isWicket, extraType, wicketType, batterName, bowlerName, outPlayerName } = body;

  // inningsNum must exist and be 1 or 2 (or super-over innings handling is handled downstream)
  if (inningsNum !== 1 && inningsNum !== 2) {
    return res.status(400).json({ success: false, message: "inningsNum must be 1 or 2" });
  }

  // runs must be a finite number (frontend passes number-like values)
  const normalizedRuns = typeof runs === "number" ? runs : Number(runs);
  if (!Number.isFinite(normalizedRuns) || normalizedRuns < 0 || normalizedRuns > 6) {
    return res.status(400).json({ success: false, message: "runs must be a number between 0 and 6" });
  }
  req.body.runs = normalizedRuns;

  if (typeof isWicket !== "boolean") {
    return res.status(400).json({ success: false, message: "isWicket flag required" });
  }

  // extraType validation (align to frontend naming)
  if (extraType !== null && extraType !== undefined && extraType !== "") {
    // Normalize middleware naming to match what the frontend actually sends
    // (frontend uses noBall/legBye; some older clients might send no-ball/leg-bye)
    const normalizedExtraType =
      extraType === "no-ball" ? "noBall" :
      extraType === "leg-bye" ? "legBye" :
      extraType;

    req.body.extraType = normalizedExtraType;

    const allowed = ["wide", "noBall", "bye", "legBye", "bonus", "penalty"];
    if (!allowed.includes(normalizedExtraType)) {
      return res.status(400).json({ success: false, message: "Invalid extraType" });
    }
  }


  // When wicket is true, require wicketType and out player
  if (isWicket) {
    if (!wicketType) {
      return res.status(400).json({ success: false, message: "wicketType required for wicket" });
    }
    if (!bowlerName) {
      return res.status(400).json({ success: false, message: "bowlerName required for wicket" });
    }
    const dismissed = outPlayerName || batterName;
    if (!dismissed) {
      return res.status(400).json({ success: false, message: "outPlayerName (or batterName) required for wicket" });
    }
  }

  // For non-wicket balls, require striker/bowler names when provided by frontend
  if (!bowlerName) {
    return res.status(400).json({ success: false, message: "bowlerName is required" });
  }
  if (!batterName && !isWicket) {
    return res.status(400).json({ success: false, message: "batterName is required" });
  }

  // Accept extra payload fields (commentary, fielderName, etc.)
  return next();
};


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

    updateLocks.set(resourceId, true);

    // Auto-release after timeout
    setTimeout(() => {
      updateLocks.delete(resourceId);
    }, timeout);

    resolve();
  });
};

exports.releaseLock = (resourceId) => {
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
    
    // Release lock when response is sent
    res.on("finish", () => {
      exports.releaseLock(resourceId);
    });

    next();
  } catch (err) {
    res.status(409).json({ success: false, message: err.message });
  }
};

/**
 * Validate request payload size
 */
exports.validatePayloadSize = (req, res, next) => {
  const maxSize = 5 * 1024 * 1024; // 5MB
  if (req.headers["content-length"] > maxSize) {
    return res.status(413).json({ success: false, message: "Payload too large" });
  }
  next();
};

/**
 * Sanitize and validate user input
 */
exports.sanitizeInput = (req, res, next) => {
  const sanitize = (obj) => {
    if (typeof obj !== "object" || obj === null) return obj;
    return Object.keys(obj).reduce((acc, key) => {
      let value = obj[key];
      if (typeof value === "string") {
        value = value.trim().slice(0, 1000); // Limit string length
      }
      acc[key] = Array.isArray(value) ? value.map(sanitize) : sanitize(value);
      return acc;
    }, Array.isArray(obj) ? [] : {});
  };

  req.body = sanitize(req.body);
  req.query = sanitize(req.query);
  req.params = sanitize(req.params);

  next();
};
