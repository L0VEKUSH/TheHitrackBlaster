"use strict";

const assert = require("node:assert/strict");
const { describe, test } = require("node:test");

const Match = require("../models/Match");
const Player = require("../models/Player");
const matchController = require("../controllers/matchController");
const playerController = require("../controllers/playerController");

const {
  aggregatePointsFromMatches,
  createPlayerDirectory,
  extractPlayerStatsFromMatch,
  resolveEmbeddedPlayer,
} = playerController._test;

const IDS = {
  smithA: "111111111111111111111111",
  smithB: "222222222222222222222222",
  alice: "333333333333333333333333",
};

const playerProfile = (_id, name, extra = {}) => ({ _id, name, team: "", photo: "", ...extra });

describe("Player-ID statistics and rankings", () => {
  test("legacy names resolve only when exactly one Player owns the name", () => {
    const directory = createPlayerDirectory([
      playerProfile(IDS.smithA, "Smith"),
      playerProfile(IDS.smithB, " smith "),
      playerProfile(IDS.alice, "Alice"),
    ]);

    assert.equal(resolveEmbeddedPlayer({ name: "SMITH" }, directory), null);
    assert.equal(resolveEmbeddedPlayer({ nameSnapshot: " alice " }, directory).playerId, IDS.alice);
    assert.equal(
      resolveEmbeddedPlayer({ playerId: IDS.smithB, nameSnapshot: "Smith" }, directory).playerId,
      IDS.smithB,
    );
  });

  test("rankings keep duplicate names separate by playerId and retain snapshots", () => {
    const directory = createPlayerDirectory([
      playerProfile(IDS.smithA, "Smith", { team: "A" }),
      playerProfile(IDS.smithB, "Smith", { team: "B" }),
    ]);
    const matches = [{
      statistics: {
        players: [
          { playerId: IDS.smithA, nameSnapshot: "Smith", runs: 40, balls: 20, points: 50 },
          { playerId: IDS.smithB, nameSnapshot: "Smith", wickets: 3, ballsBowled: 18, runsConceded: 12, points: 85 },
        ],
      },
    }];

    const ranked = aggregatePointsFromMatches(matches, directory)
      .sort((left, right) => left.playerId.localeCompare(right.playerId));

    assert.equal(ranked.length, 2);
    assert.deepEqual(ranked.map((row) => row.playerId), [IDS.smithA, IDS.smithB]);
    assert.deepEqual(ranked.map((row) => row.nameSnapshot), ["Smith", "Smith"]);
    assert.equal(ranked[0]._id, IDS.smithA);
    assert.equal(ranked[0].runs, 40);
    assert.equal(ranked[0].wickets, 0);
    assert.equal(ranked[1].runs, 0);
    assert.equal(ranked[1].wickets, 3);
  });

  test("per-match statistics and awards keep same-name players separate by playerId", () => {
    const match = {
      innings1: {
        batsmen: [{
          playerId: IDS.smithA,
          name: "Smith",
          nameSnapshot: "Smith",
          runs: 40,
          balls: 20,
          fours: 4,
          sixes: 1,
          isOut: true,
        }],
        bowlers: [{
          playerId: IDS.smithB,
          name: "Smith",
          nameSnapshot: "Smith",
          wickets: 3,
          balls: 18,
          runs: 12,
          maidens: 0,
        }],
        commentary: [],
      },
      innings2: null,
      statistics: {},
    };

    const statistics = matchController.computeMatchStatistics(match);
    const rows = statistics.players.sort((left, right) => left.playerId.localeCompare(right.playerId));

    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((row) => row.playerId), [IDS.smithA, IDS.smithB]);
    assert.deepEqual(rows.map((row) => row.nameSnapshot), ["Smith", "Smith"]);
    assert.equal(rows[0].runs, 40);
    assert.equal(rows[0].wickets, 0);
    assert.equal(rows[1].runs, 0);
    assert.equal(rows[1].wickets, 3);
    assert.equal(statistics.manOfTheMatch.playerId, IDS.smithB);
    assert.equal(statistics.bestBowling.playerId, IDS.smithB);
    assert.equal(statistics.highestScore.playerId, IDS.smithA);
  });

  test("a renamed Player is still grouped by ID while the historical name remains a snapshot", () => {
    const directory = createPlayerDirectory([
      playerProfile(IDS.alice, "Alicia"),
    ]);
    const [ranked] = aggregatePointsFromMatches([{
      statistics: {
        players: [{ playerId: IDS.alice, nameSnapshot: "Alice", runs: 25, points: 25 }],
      },
    }], directory);

    assert.equal(ranked.playerId, IDS.alice);
    assert.equal(ranked.name, "Alicia");
    assert.equal(ranked.nameSnapshot, "Alice");
  });

  test("ambiguous legacy statistics fall back to ID-backed innings instead of merging names", () => {
    const directory = createPlayerDirectory([
      playerProfile(IDS.smithA, "Smith"),
      playerProfile(IDS.smithB, "Smith"),
    ]);
    const extracted = extractPlayerStatsFromMatch({
      statistics: { players: [{ name: "Smith", runs: 99, points: 99 }] },
      innings1: {
        batsmen: [{ playerId: IDS.smithA, name: "Smith", runs: 30, balls: 10 }],
        bowlers: [{ playerId: IDS.smithB, name: "Smith", wickets: 2, balls: 12, runs: 8 }],
      },
    }, directory).sort((left, right) => left.playerId.localeCompare(right.playerId));

    assert.equal(extracted.length, 2);
    assert.equal(extracted[0].runs, 30);
    assert.equal(extracted[0].wickets, 0);
    assert.equal(extracted[1].runs, 0);
    assert.equal(extracted[1].wickets, 2);
  });

  test("career rebuild credits duplicate-name Players independently and counts a match once", async () => {
    const makeCareerPlayer = (_id, name) => ({
      _id,
      name,
      baseBatting: {},
      baseBowling: {},
      saveCalls: 0,
      async save() { this.saveCalls += 1; },
    });
    const smithA = makeCareerPlayer(IDS.smithA, "Smith");
    const smithB = makeCareerPlayer(IDS.smithB, "Smith");
    const matches = [{
      format: "T20",
      innings1: {
        batsmen: [{ playerId: IDS.smithA, name: "Smith", runs: 50, balls: 30, fours: 4, sixes: 2, isOut: true }],
        bowlers: [{ playerId: IDS.smithB, name: "Smith", wickets: 2, balls: 18, runs: 20, maidens: 0 }],
      },
      innings2: {
        batsmen: [{ playerId: IDS.smithB, name: "Smith", runs: 10, balls: 8, fours: 1, sixes: 0, isOut: false }],
        bowlers: [{ playerId: IDS.smithA, name: "Smith", wickets: 1, balls: 12, runs: 15, maidens: 0 }],
      },
    }];

    const originalPlayerFind = Player.find;
    const originalMatchFind = Match.find;
    Player.find = async () => [smithA, smithB];
    Match.find = () => ({ lean: async () => matches });
    try {
      assert.equal(await playerController.rebuildAllPlayerStats(), true);
    } finally {
      Player.find = originalPlayerFind;
      Match.find = originalMatchFind;
    }

    assert.equal(smithA.batting.matches, 1);
    assert.equal(smithA.bowling.matches, 1);
    assert.equal(smithB.batting.matches, 1);
    assert.equal(smithB.bowling.matches, 1);
    assert.equal(smithA.batting.runs, 50);
    assert.equal(smithA.bowling.wickets, 1);
    assert.equal(smithB.batting.runs, 10);
    assert.equal(smithB.bowling.wickets, 2);
    assert.equal(smithA.saveCalls, 1);
    assert.equal(smithB.saveCalls, 1);
  });

  test("career rebuild does not assign ambiguous name-only legacy rows", async () => {
    const makeCareerPlayer = (_id) => ({
      _id,
      name: "Smith",
      baseBatting: {},
      baseBowling: {},
      async save() {},
    });
    const smithA = makeCareerPlayer(IDS.smithA);
    const smithB = makeCareerPlayer(IDS.smithB);
    const matches = [{
      format: "T20",
      innings1: { batsmen: [{ name: "Smith", runs: 75, balls: 40 }] },
    }];

    const originalPlayerFind = Player.find;
    const originalMatchFind = Match.find;
    Player.find = async () => [smithA, smithB];
    Match.find = () => ({ lean: async () => matches });
    try {
      assert.equal(await playerController.rebuildAllPlayerStats(), true);
    } finally {
      Player.find = originalPlayerFind;
      Match.find = originalMatchFind;
    }

    assert.equal(smithA.batting.matches, 0);
    assert.equal(smithA.batting.runs, 0);
    assert.equal(smithB.batting.matches, 0);
    assert.equal(smithB.batting.runs, 0);
  });
});
