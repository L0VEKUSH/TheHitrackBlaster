"use strict";

const assert = require("node:assert/strict");
const { describe, test } = require("node:test");

const Match = require("../models/Match");

const errorPaths = (document) => Object.keys(document.validateSync()?.errors || {});

describe("Match model scoring validation", () => {
  test("enables Mongoose optimistic concurrency for lost-update protection", () => {
    assert.equal(Match.schema.options.optimisticConcurrency, true);
  });

  test("accepts a valid minimal event-backed match", () => {
    const match = new Match({
      teamA: "Team A",
      teamB: "Team B",
      status: "live",
      phase: "firstInnings",
      currentInnings: 1,
      innings1: {
        battingTeam: "Team A",
        bowlingTeam: "Team B",
        runs: 1,
        wickets: 0,
        balls: 1,
        extras: 0,
        batsmen: [{ name: "Alice", runs: 1, balls: 1, isActive: true, isStriker: false }],
        bowlers: [{ name: "Blake", balls: 1, runs: 1 }],
        events: [{
          type: "BALL",
          actionId: "valid-action-001",
          sequence: 1,
          inningsNumber: 1,
          batterName: "Alice",
          nonStrikerName: "Beth",
          bowlerName: "Blake",
          batsmanRuns: 1,
          extraRuns: 0,
          completedRuns: 1,
          legalDelivery: true,
        }],
      },
    });

    assert.equal(match.validateSync(), undefined);
  });

  test("requires different, non-empty team names", async () => {
    const missing = new Match({ teamA: "", teamB: "" });
    const duplicate = new Match({ teamA: "Same Team", teamB: "Same Team" });

    assert.deepEqual(errorPaths(missing).sort(), ["teamA", "teamB"]);
    await assert.rejects(
      () => duplicate.validate(),
      (error) => Boolean(error.errors?.teamB && /different/i.test(error.errors.teamB.message)),
    );
  });

  test("rejects negative totals, excessive wickets, and negative player statistics", () => {
    const match = new Match({
      teamA: "Team A",
      teamB: "Team B",
      innings1: {
        battingTeam: "Team A",
        runs: -1,
        wickets: 11,
        balls: -1,
        extras: -1,
        extrasBreakdown: { wides: -1 },
        batsmen: [{ name: "Alice", runs: -1, balls: -1, fours: -1, sixes: -1 }],
        bowlers: [{ name: "Blake", balls: -1, maidens: -1, runs: -1, wickets: 11, wides: -1, noBalls: -1 }],
      },
    });
    const paths = errorPaths(match);

    for (const path of [
      "innings1.runs",
      "innings1.wickets",
      "innings1.balls",
      "innings1.extras",
      "innings1.extrasBreakdown.wides",
      "innings1.batsmen.0.runs",
      "innings1.batsmen.0.balls",
      "innings1.batsmen.0.fours",
      "innings1.batsmen.0.sixes",
      "innings1.bowlers.0.balls",
      "innings1.bowlers.0.maidens",
      "innings1.bowlers.0.runs",
      "innings1.bowlers.0.wickets",
      "innings1.bowlers.0.wides",
      "innings1.bowlers.0.noBalls",
    ]) {
      assert.ok(paths.includes(path), `expected validation error for ${path}; got ${paths.join(", ")}`);
    }
  });

  test("rejects fractional score totals, player statistics, and scoring-event counts", () => {
    const match = new Match({
      teamA: "Team A",
      teamB: "Team B",
      target: 2.5,
      requiredRuns: 1.5,
      eventSequence: 3.5,
      innings1: {
        battingTeam: "Team A",
        runs: 1.5,
        wickets: 0.5,
        balls: 1.5,
        extras: 0.5,
        extrasBreakdown: { wides: 0.5 },
        batsmen: [{ name: "Alice", runs: 1.5, balls: 0.5, fours: 0.5, sixes: 0.5 }],
        bowlers: [{
          name: "Blake",
          balls: 1.5,
          maidens: 0.5,
          runs: 1.5,
          wickets: 0.5,
          wides: 0.5,
          noBalls: 0.5,
        }],
        events: [{
          type: "BALL",
          actionId: "fractional-event-001",
          sequence: 1.5,
          inningsNumber: 1,
          batterName: "Alice",
          bowlerName: "Blake",
          batsmanRuns: 1.5,
          extraRuns: 0.5,
          completedRuns: 1.5,
        }],
      },
    });
    const paths = errorPaths(match);

    for (const path of [
      "target",
      "requiredRuns",
      "eventSequence",
      "innings1.runs",
      "innings1.wickets",
      "innings1.balls",
      "innings1.extras",
      "innings1.extrasBreakdown.wides",
      "innings1.batsmen.0.runs",
      "innings1.batsmen.0.balls",
      "innings1.batsmen.0.fours",
      "innings1.batsmen.0.sixes",
      "innings1.bowlers.0.balls",
      "innings1.bowlers.0.maidens",
      "innings1.bowlers.0.runs",
      "innings1.bowlers.0.wickets",
      "innings1.bowlers.0.wides",
      "innings1.bowlers.0.noBalls",
      "innings1.events.0.sequence",
      "innings1.events.0.batsmanRuns",
      "innings1.events.0.extraRuns",
      "innings1.events.0.completedRuns",
    ]) {
      assert.ok(paths.includes(path), `expected whole-number validation for ${path}; got ${paths.join(", ")}`);
    }
  });

  test("rejects invalid match lifecycle and derived fields", () => {
    const match = new Match({
      teamA: "Team A",
      teamB: "Team B",
      status: "broken",
      phase: "unknown",
      currentInnings: 3,
      target: -1,
      requiredRuns: -1,
      requiredRunRate: -1,
      eventSequence: -1,
      overs: 2.5,
    });
    const paths = errorPaths(match);

    for (const path of [
      "status",
      "phase",
      "currentInnings",
      "target",
      "requiredRuns",
      "requiredRunRate",
      "eventSequence",
      "overs",
    ]) {
      assert.ok(paths.includes(path), `expected validation error for ${path}; got ${paths.join(", ")}`);
    }
  });

  test("rejects malformed scoring-event identity, sequence, innings, and enums", () => {
    const match = new Match({
      teamA: "Team A",
      teamB: "Team B",
      innings1: {
        events: [{
          type: "NOT_AN_EVENT",
          actionId: "",
          sequence: 0,
          inningsNumber: 3,
          extraType: "freeRuns",
          secondaryExtraType: "invalid",
        }],
      },
    });
    const paths = errorPaths(match);

    for (const path of [
      "innings1.events.0.type",
      "innings1.events.0.actionId",
      "innings1.events.0.sequence",
      "innings1.events.0.inningsNumber",
      "innings1.events.0.extraType",
      "innings1.events.0.secondaryExtraType",
    ]) {
      assert.ok(paths.includes(path), `expected validation error for ${path}; got ${paths.join(", ")}`);
    }
  });

  test("Mongoose casts two innings into independent nested documents", () => {
    const source = {
      battingTeam: "Team A",
      bowlingTeam: "Team B",
      runs: 0,
      wickets: 0,
      balls: 0,
      extrasBreakdown: { wides: 0 },
      batsmen: [{ name: "Alice" }],
    };
    const match = new Match({
      teamA: "Team A",
      teamB: "Team B",
      innings1: source,
      innings2: { ...source, battingTeam: "Team B", bowlingTeam: "Team A" },
    });

    assert.notStrictEqual(match.innings1, match.innings2);
    assert.notStrictEqual(match.innings1.extrasBreakdown, match.innings2.extrasBreakdown);
    assert.notStrictEqual(match.innings1.batsmen, match.innings2.batsmen);
    match.innings1.runs = 45;
    match.innings1.extrasBreakdown.wides = 2;
    match.innings1.batsmen[0].runs = 43;
    assert.equal(match.innings2.runs, 0);
    assert.equal(match.innings2.extrasBreakdown.wides, 0);
    assert.equal(match.innings2.batsmen[0].runs, 0);
  });

  test("teamScores virtual maps by battingTeam and returns independent projections", () => {
    const match = new Match({
      teamA: "Team A",
      teamB: "Team B",
      innings1: { battingTeam: "Team B", runs: 45, wickets: 2, balls: 14 },
      innings2: { battingTeam: "Team A", runs: 12, wickets: 1, balls: 6 },
    });
    const scores = match.teamScores;

    assert.equal(scores.teamA.score.runs, 12);
    assert.equal(scores.teamA.score.overs, "1.0");
    assert.equal(scores.teamB.score.runs, 45);
    assert.equal(scores.teamB.score.overs, "2.2");
    assert.notStrictEqual(scores.teamA.score, scores.teamB.score);
  });
});
