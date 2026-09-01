const MATCH_CONTEXT_KEYS = Object.freeze({
  regulation: ["innings1", "innings2"],
  superOver: ["superOverInnings1", "superOverInnings2"],
});

const SIDE_KEYS = Object.freeze(["teamA", "teamB"]);

const normalizeIdentity = (value) => {
  if (value === null || value === undefined) return "";
  return String(value).trim().replace(/\s+/g, " ").toLocaleLowerCase();
};

const identityValues = (value) => {
  if (value === null || value === undefined) return [];
  if (typeof value !== "object") return [value];

  return [
    value._id,
    value.id,
    value.name,
    value.team,
    value.shortName,
    value.code,
  ].filter((candidate) => candidate !== null && candidate !== undefined && candidate !== "");
};

const identitySet = (...values) => new Set(
  values.flatMap(identityValues).map(normalizeIdentity).filter(Boolean),
);

const getSide = (match, teamOrSide) => {
  if (!match) return null;
  if (SIDE_KEYS.includes(teamOrSide)) return teamOrSide;

  const requested = identitySet(teamOrSide);
  if (!requested.size) return null;

  return SIDE_KEYS.find((side) => {
    const suffix = side === "teamA" ? "A" : "B";
    const aliases = identitySet(
      match[side],
      match[`${side}Id`],
      match[`team${suffix}Short`],
    );
    return [...requested].some((identity) => aliases.has(identity));
  }) || null;
};

const getSideAliases = (match, side, fallbackTeam) => {
  if (!side) return identitySet(fallbackTeam);
  const suffix = side === "teamA" ? "A" : "B";
  return identitySet(
    fallbackTeam,
    match?.[side],
    match?.[`${side}Id`],
    match?.[`team${suffix}Short`],
  );
};

const inningsBelongsTo = (innings, aliases) => {
  if (!innings || !aliases.size) return false;
  const battingIdentities = identitySet(innings.battingTeam, innings.battingTeamId);
  return [...battingIdentities].some((identity) => aliases.has(identity));
};

const getContext = (match, context) => {
  if (context === "regulation" || context === "superOver") return context;
  return match?.isSuperOver ? "superOver" : "regulation";
};

const getContextKeys = (match, context = "active") => (
  MATCH_CONTEXT_KEYS[getContext(match, context)]
);

const toFiniteNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const getComparableState = (match) => ({
  version: toFiniteNumber(match?.stateVersion ?? match?.__v),
  eventSequence: toFiniteNumber(match?.lastEventSequence ?? match?.eventSequence),
  updatedAt: match?.updatedAt ? Date.parse(match.updatedAt) : null,
});

const compareKnownValue = (currentValue, candidateValue) => {
  const currentKnown = Number.isFinite(currentValue);
  const candidateKnown = Number.isFinite(candidateValue);

  if (currentKnown && candidateKnown) {
    if (candidateValue > currentValue) return 1;
    if (candidateValue < currentValue) return -1;
    return 0;
  }
  if (candidateKnown) return 1;
  if (currentKnown) return -1;
  return 0;
};

/**
 * Return the innings for a numbered slot in the requested scoring context.
 * `active` means regulation normally and super-over innings during a super over.
 */
export function getInnings(match, inningsNumber, { context = "active" } = {}) {
  const number = Number(inningsNumber);
  if (!match || (number !== 1 && number !== 2)) return null;
  const key = getContextKeys(match, context)[number - 1];
  return match[key] || null;
}

export function getActiveInnings(match) {
  return getInnings(match, Number(match?.currentInnings) === 2 ? 2 : 1);
}

export function getPreviousInnings(match) {
  if (Number(match?.currentInnings) !== 2) return null;
  return getInnings(match, 1);
}

/**
 * Map a team to its innings by batting-team identity. There is intentionally no
 * positional fallback: innings order depends on the toss, and guessing is what
 * caused both teams to display the same innings.
 */
export function getTeamInnings(match, teamOrSide, { context = "regulation" } = {}) {
  if (!match) return null;
  const side = getSide(match, teamOrSide);
  const aliases = getSideAliases(match, side, teamOrSide);
  if (!aliases.size) return null;

  const keys = getContextKeys(match, context);
  return keys.map((key) => match[key]).find((innings) => inningsBelongsTo(innings, aliases)) || null;
}

/**
 * Prefer a full innings object, while supporting the backend's compact
 * regulation `teamScores` projection used by match-list endpoints.
 */
export function getTeamScore(match, teamOrSide, options = {}) {
  const innings = getTeamInnings(match, teamOrSide, options);
  if (innings) return innings;

  const context = getContext(match, options.context || "regulation");
  const side = getSide(match, teamOrSide);
  if (context !== "regulation" || !side) return null;

  const projected = match?.teamScores?.[side];
  if (!projected?.score) return null;
  const aliases = getSideAliases(match, side, teamOrSide);
  const projectedIdentities = identitySet(projected.score.battingTeam || projected.team);
  return [...projectedIdentities].some((identity) => aliases.has(identity))
    ? projected.score
    : null;
}

export function formatInningsScore(innings) {
  if (!innings) return null;
  const runs = Math.max(0, toFiniteNumber(innings.runs) ?? 0);
  const wickets = Math.max(0, toFiniteNumber(innings.wickets) ?? 0);
  const legalBallsValue = toFiniteNumber(innings.legalBalls ?? innings.balls);
  const legalBalls = legalBallsValue === null ? null : Math.max(0, Math.floor(legalBallsValue));
  const overs = legalBalls !== null
    ? `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`
    : (typeof innings.overs === "string" && /^\d+\.[0-5]$/.test(innings.overs)
      ? innings.overs
      : "0.0");
  return `${runs}/${wickets} (${overs})`;
}

/**
 * Compare a candidate server state with the state currently rendered.
 * Returns 1 for newer, -1 for stale/incomplete, and 0 for the same or when no
 * authoritative ordering data exists.
 */
export function compareMatchStateVersion(current, candidate) {
  if (!candidate) return -1;
  if (!current) return 1;

  const currentState = getComparableState(current);
  const candidateState = getComparableState(candidate);

  const versionComparison = compareKnownValue(currentState.version, candidateState.version);
  if (versionComparison !== 0) return versionComparison;

  const versionsAreEqual = Number.isFinite(currentState.version) &&
    Number.isFinite(candidateState.version);
  if (versionsAreEqual) {
    if (Number.isFinite(currentState.eventSequence) && Number.isFinite(candidateState.eventSequence)) {
      return compareKnownValue(currentState.eventSequence, candidateState.eventSequence);
    }
    return 0;
  }

  const sequenceComparison = compareKnownValue(
    currentState.eventSequence,
    candidateState.eventSequence,
  );
  if (sequenceComparison !== 0) return sequenceComparison;

  const sequencesAreEqual = Number.isFinite(currentState.eventSequence) &&
    Number.isFinite(candidateState.eventSequence);
  if (sequencesAreEqual) return 0;

  return compareKnownValue(currentState.updatedAt, candidateState.updatedAt);
}

export function shouldAcceptMatchState(current, candidate, expectedMatchId = null) {
  if (!candidate) return false;

  const expectedId = normalizeIdentity(expectedMatchId);
  const candidateId = normalizeIdentity(candidate._id ?? candidate.id);
  // A route-scoped consumer must never accept a late HTTP or mutation response
  // from the match that was open before navigation. Authoritative match
  // responses always carry an ID, so an ID-less candidate is also rejected in
  // this mode rather than being allowed to poison the next match's state.
  if (expectedId && candidateId !== expectedId) return false;
  if (!current) return true;

  const currentId = normalizeIdentity(current._id ?? current.id);
  if (currentId && candidateId && currentId !== candidateId) return false;

  return compareMatchStateVersion(current, candidate) >= 0;
}

/**
 * Equal authoritative snapshots are safe but do not need to replace React
 * state. Keeping the existing object prevents reconnect/refetch snapshots from
 * retriggering effects that own in-progress UI drafts.
 */
export function shouldReplaceMatchState(current, candidate, expectedMatchId = null) {
  if (!shouldAcceptMatchState(current, candidate, expectedMatchId)) return false;
  return !current || compareMatchStateVersion(current, candidate) > 0;
}
