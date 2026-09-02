"use strict";

/**
 * Shared player-identity helpers.
 *
 * New match/scoring data uses an immutable Player id together with a display
 * name snapshot. The name-only branches exist solely so old matches can still
 * be read and migrated; new scoring writes are validated by id.
 */

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

const cleanText = (value) => String(value == null ? "" : value).trim();

const normalizeIdentityText = (value) => cleanText(value)
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("en")
  .replace(/[^a-z0-9]+/g, " ")
  .trim()
  .replace(/\s+/g, " ");

function isValidObjectId(id) {
  return OBJECT_ID_PATTERN.test(cleanText(id));
}

function normalizeParticipant(value) {
  if (!value) return { playerId: "", nameSnapshot: "" };
  if (typeof value === "string") {
    const text = cleanText(value);
    return isValidObjectId(text)
      ? { playerId: text, nameSnapshot: "" }
      : { playerId: "", nameSnapshot: text };
  }
  return {
    playerId: cleanText(value.playerId || value._id),
    nameSnapshot: cleanText(value.nameSnapshot || value.name || value.playerName),
  };
}

function participantKey(value) {
  const participant = normalizeParticipant(value);
  if (participant.playerId) return `id:${participant.playerId}`;
  const normalizedName = normalizeIdentityText(participant.nameSnapshot);
  return normalizedName ? `legacy-name:${normalizedName}` : "";
}

function sameParticipant(left, right) {
  const a = normalizeParticipant(left);
  const b = normalizeParticipant(right);
  if (a.playerId || b.playerId) {
    return Boolean(a.playerId && b.playerId && a.playerId === b.playerId);
  }
  const leftName = normalizeIdentityText(a.nameSnapshot);
  return Boolean(leftName && leftName === normalizeIdentityText(b.nameSnapshot));
}

function findParticipant(items, reference) {
  if (!Array.isArray(items)) return null;
  return items.find((item) => sameParticipant(item, reference)) || null;
}

/**
 * Resolve an identifier using an injected repository. Repository functions
 * may accept either `{ playerId }` or `{ nameSnapshot }` and should return one
 * unambiguous Player. Unknown/ambiguous names are never accepted.
 */
async function resolvePlayer(identifier, roster = [], playerRepository = null) {
  const requested = normalizeParticipant(identifier);
  const rosterMatch = findParticipant(roster, requested);
  if (rosterMatch) return normalizeParticipant(rosterMatch);
  if (typeof playerRepository !== "function") return null;

  const player = await playerRepository(requested);
  if (!player) return null;
  const resolved = normalizeParticipant(player);
  return resolved.playerId && resolved.nameSnapshot ? resolved : null;
}

function getActiveBatsmen(innings) {
  if (!Array.isArray(innings?.batsmen)) return [];
  return innings.batsmen
    .filter((batter) => batter && batter.isActive !== false && !batter.isOut)
    .map(normalizeParticipant)
    .filter((participant) => participant.playerId || participant.nameSnapshot);
}

function getCurrentBowler(innings) {
  if (!innings) return null;
  const reference = {
    playerId: innings.currentBowlerId,
    nameSnapshot: innings.currentBowler || innings.currentBowlerNameSnapshot,
  };
  const bowler = findParticipant(innings.bowlers, reference);
  const participant = normalizeParticipant(bowler || reference);
  return participant.playerId || participant.nameSnapshot ? participant : null;
}

function getPlayingXIEntries(playingXI) {
  return Array.isArray(playingXI?.playingXI) ? playingXI.playingXI : [];
}

/** Substitutes are deliberately excluded: a configured bench cannot bat/bowl. */
function isInPlayingXI(identifier, playingXI) {
  const requested = normalizeParticipant(identifier);
  return getPlayingXIEntries(playingXI).some((entry) => {
    const rosterMember = normalizeParticipant(entry);
    if (rosterMember.playerId && requested.playerId) return rosterMember.playerId === requested.playerId;
    const rosterName = normalizeIdentityText(rosterMember.nameSnapshot);
    return Boolean(rosterName && rosterName === normalizeIdentityText(requested.nameSnapshot));
  });
}

function getPlayingXICount(playingXI, fallback = 11) {
  if (!playingXI || !Array.isArray(playingXI.playingXI)) return fallback;
  return playingXI.playingXI.length;
}

function getMaxWicketsFromPlayingXI(playingXI, fallback = 10) {
  if (!playingXI || !Array.isArray(playingXI.playingXI) || playingXI.playingXI.length === 0) {
    return fallback;
  }
  return Math.max(1, playingXI.playingXI.length - 1);
}

function getPlayingXIForTeam(match, team, { legacyFallback = true } = {}) {
  if (!match || !team) return null;
  const isTeamA = team === match.teamA;
  const isTeamB = team === match.teamB;
  if (!isTeamA && !isTeamB) return null;

  const configured = isTeamA ? match.teamAPlayingXI : match.teamBPlayingXI;
  if (configured) return configured;
  if (!legacyFallback) return null;

  const participants = isTeamA ? match.teamAParticipants : match.teamBParticipants;
  if (Array.isArray(participants) && participants.length > 0) {
    return { playingXI: participants, substitutes: [], legacy: true };
  }
  const squad = isTeamA ? match.squadA : match.squadB;
  if (Array.isArray(squad) && squad.length > 0) {
    return { playingXI: squad, substitutes: [], legacy: true };
  }
  return null;
}

function validatePlayerParticipation(playerIdentifier, playingXI, participationType = "bat") {
  if (!playingXI) return { valid: true, legacy: true };
  if (!isInPlayingXI(playerIdentifier, playingXI)) {
    return {
      valid: false,
      reason: `Player is not in the Playing XI and cannot ${participationType}`,
    };
  }
  return { valid: true, legacy: Boolean(playingXI.legacy) };
}

function levenshteinDistance(left, right) {
  const a = normalizeIdentityText(left);
  const b = normalizeIdentityText(right);
  if (!a) return b.length;
  if (!b) return a.length;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[b.length];
}

function identitySimilarity(left, right) {
  const a = normalizeIdentityText(left);
  const b = normalizeIdentityText(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  return Math.max(0, 1 - (levenshteinDistance(a, b) / Math.max(a.length, b.length)));
}

function rankPlayerCandidates(nameSnapshot, players, { team = "", limit = 5 } = {}) {
  const normalizedTeam = normalizeIdentityText(team);
  return (Array.isArray(players) ? players : [])
    .map((player) => {
      const participant = normalizeParticipant(player);
      const nameScore = Math.max(
        identitySimilarity(nameSnapshot, participant.nameSnapshot),
        identitySimilarity(nameSnapshot, player?.fullName),
      );
      const teamMatches = normalizedTeam && normalizeIdentityText(player?.team) === normalizedTeam;
      const score = Math.min(1, nameScore + (teamMatches ? 0.08 : 0));
      return {
        playerId: participant.playerId,
        nameSnapshot: participant.nameSnapshot,
        fullName: cleanText(player?.fullName),
        team: cleanText(player?.team),
        role: cleanText(player?.role),
        photo: cleanText(player?.photo),
        score: Number(score.toFixed(4)),
      };
    })
    .filter((candidate) => candidate.playerId && candidate.nameSnapshot && candidate.score >= 0.45)
    .sort((a, b) => b.score - a.score || a.nameSnapshot.localeCompare(b.nameSnapshot))
    .slice(0, Math.max(1, limit));
}

module.exports = {
  cleanText,
  findParticipant,
  getActiveBatsmen,
  getCurrentBowler,
  getMaxWicketsFromPlayingXI,
  getPlayingXICount,
  getPlayingXIEntries,
  getPlayingXIForTeam,
  identitySimilarity,
  isInPlayingXI,
  isValidObjectId,
  levenshteinDistance,
  normalizeIdentityText,
  normalizeParticipant,
  participantKey,
  rankPlayerCandidates,
  resolvePlayer,
  sameParticipant,
  validatePlayerParticipation,
};
