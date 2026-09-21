"use strict";

const mongoose = require("mongoose");

const normalizePlayerName = (value) => String(value || "")
  .normalize("NFKC")
  .trim()
  .replace(/\s+/g, " ")
  .toLocaleLowerCase("en");

const playerIdOf = (player) => String(player?._id || player?.playerId || "").trim();

const snapshotOf = (player) => String(player?.name || player?.nameSnapshot || player?.fullName || "")
  .trim()
  .replace(/\s+/g, " ");

const levenshteinDistance = (leftValue, rightValue) => {
  const left = normalizePlayerName(leftValue);
  const right = normalizePlayerName(rightValue);
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost,
      );
    }
    previous = current;
  }
  return previous[right.length];
};

const similarityScore = (input, candidate) => {
  const normalizedInput = normalizePlayerName(input);
  const normalizedCandidate = normalizePlayerName(candidate);
  if (!normalizedInput || !normalizedCandidate) return 0;
  if (normalizedInput === normalizedCandidate) return 1;

  const distance = levenshteinDistance(normalizedInput, normalizedCandidate);
  const editScore = 1 - (distance / Math.max(normalizedInput.length, normalizedCandidate.length));
  const containsBonus = normalizedInput.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedInput)
    ? 0.08
    : 0;
  const prefixBonus = normalizedInput[0] === normalizedCandidate[0] ? 0.03 : 0;
  return Math.max(0, Math.min(0.999, editScore + containsBonus + prefixBonus));
};

const candidateNames = (player) => [player?.name, player?.fullName, player?.nameSnapshot]
  .map((name) => String(name || "").trim())
  .filter(Boolean);

const exactMatches = (input, players) => {
  const wanted = normalizePlayerName(input);
  const byId = new Map();
  for (const player of players || []) {
    const id = playerIdOf(player);
    if (!id || !candidateNames(player).some((name) => normalizePlayerName(name) === wanted)) continue;
    byId.set(id, player);
  }
  return [...byId.values()];
};

const rankFuzzyCandidates = (input, players, limit = 5) => {
  const byId = new Map();
  for (const player of players || []) {
    const playerId = playerIdOf(player);
    const nameSnapshot = snapshotOf(player);
    if (!playerId || !nameSnapshot) continue;
    const score = Math.max(...candidateNames(player).map((name) => similarityScore(input, name)));
    const candidate = {
      playerId,
      nameSnapshot,
      fullName: String(player.fullName || ""),
      team: String(player.team || ""),
      role: String(player.role || ""),
      photo: String(player.photo || ""),
      score: Number(score.toFixed(3)),
    };
    const current = byId.get(playerId);
    if (!current || candidate.score > current.score) byId.set(playerId, candidate);
  }

  return [...byId.values()]
    .sort((left, right) => right.score - left.score ||
      left.nameSnapshot.localeCompare(right.nameSnapshot) ||
      left.playerId.localeCompare(right.playerId))
    .slice(0, Math.max(0, limit));
};

const issueLocation = ({ side, list, index }) => ({ side, list, index });

const resolveParticipantEntries = ({ entries, players, side, list }) => {
  const participants = [];
  const validationIssues = [];
  const resolutionIssues = [];
  const playersById = new Map((players || [])
    .map((player) => [playerIdOf(player), player])
    .filter(([id]) => id));

  (entries || []).forEach((entry, index) => {
    const location = issueLocation({ side, list, index });
    if (typeof entry === "string") {
      const input = entry.trim();
      if (!input) {
        validationIssues.push({ ...location, code: "PLAYER_NAME_REQUIRED", message: "Player name cannot be empty" });
        return;
      }
      const matches = exactMatches(input, players);
      if (matches.length !== 1) {
        resolutionIssues.push({
          ...location,
          input,
          code: matches.length > 1 ? "AMBIGUOUS_PLAYER_NAME" : "PLAYER_NAME_NOT_FOUND",
          message: matches.length > 1
            ? `Multiple players exactly match ${input}`
            : `No player exactly matches ${input}`,
          candidates: rankFuzzyCandidates(input, players),
        });
        return;
      }
      participants.push({ playerId: playerIdOf(matches[0]), nameSnapshot: snapshotOf(matches[0]) });
      return;
    }

    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      validationIssues.push({ ...location, code: "INVALID_PARTICIPANT", message: "Participant must be a player object or legacy name" });
      return;
    }

    const rawPlayerId = String(entry.playerId || "").trim();
    if (!rawPlayerId) {
      validationIssues.push({ ...location, code: "PLAYER_ID_REQUIRED", message: "playerId is required for participant objects" });
      return;
    }
    if (!mongoose.Types.ObjectId.isValid(rawPlayerId)) {
      validationIssues.push({ ...location, code: "INVALID_PLAYER_ID", message: `${rawPlayerId} is not a valid playerId` });
      return;
    }
    const player = playersById.get(rawPlayerId);
    if (!player) {
      resolutionIssues.push({
        ...location,
        input: rawPlayerId,
        code: "PLAYER_ID_NOT_FOUND",
        message: `Player ${rawPlayerId} does not exist`,
        candidates: entry.nameSnapshot
          ? rankFuzzyCandidates(entry.nameSnapshot, players)
          : [],
      });
      return;
    }
    participants.push({ playerId: rawPlayerId, nameSnapshot: snapshotOf(player) });
  });

  return { participants, validationIssues, resolutionIssues };
};

const participantIds = (entries) => (entries || [])
  .map((entry) => typeof entry === "object" && entry ? String(entry.playerId || "").trim() : "")
  .filter(Boolean);

module.exports = {
  exactMatches,
  levenshteinDistance,
  normalizePlayerName,
  participantIds,
  playerIdOf,
  rankFuzzyCandidates,
  resolveParticipantEntries,
  similarityScore,
  snapshotOf,
};
