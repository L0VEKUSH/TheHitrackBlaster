import test from "node:test";
import assert from "node:assert/strict";

import {
  compareMatchStateVersion,
  formatInningsScore,
  getActiveInnings,
  getPreviousInnings,
  getTeamInnings,
  getTeamScore,
  shouldAcceptMatchState,
  shouldReplaceMatchState,
} from "./matchSelectors.js";

const reversedBattingOrder = {
  _id: "match-1",
  teamA: "Falcons",
  teamAShort: "FAL",
  teamB: "Titans",
  teamBShort: "TIT",
  currentInnings: 1,
  innings1: { battingTeam: "Titans", runs: 45, wickets: 2, balls: 26 },
};

test("team mapping never assigns the first innings to both teams", () => {
  assert.equal(getTeamInnings(reversedBattingOrder, "teamA"), null);
  assert.equal(getTeamInnings(reversedBattingOrder, "teamB"), reversedBattingOrder.innings1);
  assert.equal(getTeamScore(reversedBattingOrder, "Falcons"), null);
  assert.equal(formatInningsScore(getTeamScore(reversedBattingOrder, "Titans")), "45/2 (4.2)");
});

test("team scores follow batting identity, not innings position", () => {
  const match = {
    ...reversedBattingOrder,
    currentInnings: 2,
    innings2: { battingTeam: "Falcons", runs: 12, wickets: 1, balls: 8 },
  };

  assert.equal(getTeamInnings(match, "teamA"), match.innings2);
  assert.equal(getTeamInnings(match, "teamB"), match.innings1);
  assert.notEqual(getTeamInnings(match, "teamA"), getTeamInnings(match, "teamB"));
});

test("compact authoritative teamScores projections are supported safely", () => {
  const match = {
    teamA: "Falcons",
    teamB: "Titans",
    teamScores: {
      teamA: { team: "Falcons", score: null },
      teamB: {
        team: "Titans",
        score: { battingTeam: "Titans", runs: 8, wickets: 0, legalBalls: 6, overs: "1.0" },
      },
    },
  };

  assert.equal(getTeamScore(match, "teamA"), null);
  assert.equal(formatInningsScore(getTeamScore(match, "teamB")), "8/0 (1.0)");

  match.teamScores.teamA.score = match.teamScores.teamB.score;
  assert.equal(getTeamScore(match, "teamA"), null, "a projection for the wrong batting team is rejected");
});

test("active and previous innings use super-over state while a super over is active", () => {
  const match = {
    teamA: "Falcons",
    teamB: "Titans",
    isSuperOver: true,
    currentInnings: 2,
    innings1: { battingTeam: "Falcons", runs: 150 },
    innings2: { battingTeam: "Titans", runs: 150 },
    superOverInnings1: { battingTeam: "Titans", runs: 10, wickets: 1, balls: 6 },
    superOverInnings2: { battingTeam: "Falcons", runs: 4, wickets: 0, balls: 2 },
  };

  assert.equal(getActiveInnings(match), match.superOverInnings2);
  assert.equal(getPreviousInnings(match), match.superOverInnings1);
  assert.equal(getTeamInnings(match, "teamA", { context: "superOver" }), match.superOverInnings2);
  assert.equal(getTeamInnings(match, "teamB", { context: "superOver" }), match.superOverInnings1);
  assert.equal(getTeamInnings(match, "teamA"), match.innings1);
});

test("state comparison rejects stale versions and accepts equal/newer states", () => {
  const current = { _id: "match-1", stateVersion: 7, lastEventSequence: 12 };

  assert.equal(compareMatchStateVersion(current, { ...current, stateVersion: 6, lastEventSequence: 99 }), -1);
  assert.equal(compareMatchStateVersion(current, { ...current, lastEventSequence: 11 }), -1);
  assert.equal(compareMatchStateVersion(current, { ...current }), 0);
  assert.equal(compareMatchStateVersion(current, { ...current, stateVersion: 8, lastEventSequence: 13 }), 1);
  assert.equal(compareMatchStateVersion(current, { _id: "match-1", stateVersion: 7 }), 0);
  assert.equal(shouldAcceptMatchState(current, { ...current, lastEventSequence: 11 }), false);
  assert.equal(shouldAcceptMatchState(current, { ...current, lastEventSequence: 12 }), true);
  assert.equal(shouldAcceptMatchState(current, { ...current, stateVersion: 8 }), true);
});

test("state comparison falls back to event sequence and rejects another match", () => {
  const current = { _id: "match-1", eventSequence: 20 };
  assert.equal(compareMatchStateVersion(current, { _id: "match-1", eventSequence: 21 }), 1);
  assert.equal(compareMatchStateVersion(current, { _id: "match-1", eventSequence: 19 }), -1);
  assert.equal(shouldAcceptMatchState(current, { _id: "match-2", eventSequence: 21 }), false);
  assert.equal(shouldAcceptMatchState(current, null), false);
});

test("route-scoped state acceptance rejects late or identity-less snapshots", () => {
  assert.equal(
    shouldAcceptMatchState(null, { _id: "match-1", stateVersion: 1 }, "match-2"),
    false,
  );
  assert.equal(
    shouldAcceptMatchState(null, { stateVersion: 1 }, "match-2"),
    false,
  );
  assert.equal(
    shouldAcceptMatchState(null, { _id: "match-2", stateVersion: 1 }, "match-2"),
    true,
  );
});

test("equal snapshots are accepted without replacing the rendered state", () => {
  const current = { _id: "match-1", stateVersion: 4, lastEventSequence: 9 };

  assert.equal(shouldReplaceMatchState(null, current, "match-1"), true);
  assert.equal(shouldReplaceMatchState(current, { ...current }, "match-1"), false);
  assert.equal(
    shouldReplaceMatchState(current, { ...current, lastEventSequence: 10 }, "match-1"),
    true,
  );
  assert.equal(
    shouldReplaceMatchState(current, { ...current, stateVersion: 3 }, "match-1"),
    false,
  );
});
