/**
 * Tournament Rules Utility
 * Provides safe access to tournament configuration with fallback to defaults
 */

const DEFAULT_RULES = {
  innings: {
    overs: 20,
    maxWickets: 10,
  },
  bowling: {
    maxOversPerBowler: null, // null = no limit
    allowConsecutiveOvers: false,
  },
  points: {
    win: 2,
    tie: 1,
    noResult: 1,
    loss: 0,
  },
  superOver: {
    enabled: true,
    repeatIfTied: true,
    maxWickets: 2,
    overs: 1,
  },
  freeHit: {
    enabled: true,
  },
  powerplay: {
    enabled: false,
  },
};

/**
 * Get tournament rules with safe fallback to defaults
 * @param {Object} tournament - Tournament document
 * @param {string} inningsNumber - "1" or "2" (or null for generic rules)
 * @returns {Object} Safe rules configuration
 */
function getRulesForTournament(tournament, inningsNumber = null) {
  if (!tournament) return DEFAULT_RULES;

  // Use structured rulesConfig if available, otherwise use defaults
  const rules = tournament.rulesConfig || DEFAULT_RULES;

  // Deep merge with defaults to handle partial configs
  return mergeWithDefaults(rules);
}

/**
 * Get maximum overs for an innings
 * @param {Object} tournament
 * @returns {number}
 */
function getMaxOvers(tournament) {
  const rules = getRulesForTournament(tournament);
  return rules.innings?.overs || DEFAULT_RULES.innings.overs;
}

/**
 * Get maximum wickets allowed
 * @param {Object} tournament
 * @returns {number}
 */
function getMaxWickets(tournament) {
  const rules = getRulesForTournament(tournament);
  return rules.innings?.maxWickets || DEFAULT_RULES.innings.maxWickets;
}

/**
 * Get points awarded for a result
 * @param {Object} tournament
 * @param {string} result - "win" | "tie" | "loss" | "noResult"
 * @returns {number}
 */
function getPointsFor(tournament, result) {
  const rules = getRulesForTournament(tournament);
  const points = rules.points || DEFAULT_RULES.points;
  return points[result] ?? 0;
}

/**
 * Check if super over is enabled
 * @param {Object} tournament
 * @returns {boolean}
 */
function isSuperOverEnabled(tournament) {
  const rules = getRulesForTournament(tournament);
  return rules.superOver?.enabled ?? DEFAULT_RULES.superOver.enabled;
}

/**
 * Check if free hit is enabled
 * @param {Object} tournament
 * @returns {boolean}
 */
function isFreeHitEnabled(tournament) {
  const rules = getRulesForTournament(tournament);
  return rules.freeHit?.enabled ?? DEFAULT_RULES.freeHit.enabled;
}

/**
 * Deep merge rules with defaults to ensure no missing fields
 * @private
 * @param {Object} rules
 * @returns {Object}
 */
function mergeWithDefaults(rules) {
  const merged = { ...DEFAULT_RULES };

  if (rules?.innings) {
    merged.innings = { ...DEFAULT_RULES.innings, ...rules.innings };
  }
  if (rules?.bowling) {
    merged.bowling = { ...DEFAULT_RULES.bowling, ...rules.bowling };
  }
  if (rules?.points) {
    merged.points = { ...DEFAULT_RULES.points, ...rules.points };
  }
  if (rules?.superOver) {
    merged.superOver = { ...DEFAULT_RULES.superOver, ...rules.superOver };
  }
  if (rules?.freeHit) {
    merged.freeHit = { ...DEFAULT_RULES.freeHit, ...rules.freeHit };
  }
  if (rules?.powerplay) {
    merged.powerplay = { ...DEFAULT_RULES.powerplay, ...rules.powerplay };
  }

  return merged;
}

module.exports = {
  DEFAULT_RULES,
  getRulesForTournament,
  getMaxOvers,
  getMaxWickets,
  getPointsFor,
  isSuperOverEnabled,
  isFreeHitEnabled,
};
