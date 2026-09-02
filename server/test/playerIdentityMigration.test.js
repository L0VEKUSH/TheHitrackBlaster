"use strict";

const assert = require("node:assert/strict");
const { describe, test } = require("node:test");

const {
  backfillFreeHitMarkers,
  buildPlayerIndex,
  migrateEventIdentity,
  migrateMatchIdentity,
  resolveLegacyIdentity,
} = require("../scripts/migratePlayerIdentity");

const IDS = {
  batterA: "111111111111111111111111",
  batterB: "222222222222222222222222",
  bowler: "333333333333333333333333",
  duplicate: "444444444444444444444444",
};

const players = [
  { _id: IDS.batterA, name: "Alex One", fullName: "Alexander One", team: "Team A" },
  { _id: IDS.batterB, name: "Beth Two", team: "Team A" },
  { _id: IDS.bowler, name: "Chris Three", team: "Team B" },
];

describe("player identity migration", () => {
  test("resolves unique exact names and full names but never auto-selects fuzzy matches", () => {
    const index = buildPlayerIndex(players);

    assert.equal(resolveLegacyIdentity("Alex One", "Team A", index).participant.playerId, IDS.batterA);
    assert.equal(resolveLegacyIdentity("Alexander One", "Team A", index).participant.playerId, IDS.batterA);

    const fuzzy = resolveLegacyIdentity("Alx One", "Team A", index);
    assert.equal(fuzzy.status, "fuzzy-confirmation-required");
    assert.equal(fuzzy.candidates[0].playerId, IDS.batterA);
  });

  test("uses team evidence for duplicate names and reports unresolved same-team duplicates", () => {
    const crossTeam = buildPlayerIndex([
      { _id: IDS.batterA, name: "Smith", team: "Team A" },
      { _id: IDS.bowler, name: "Smith", team: "Team B" },
    ]);
    assert.equal(resolveLegacyIdentity("Smith", "Team B", crossTeam).participant.playerId, IDS.bowler);

    const sameTeam = buildPlayerIndex([
      { _id: IDS.batterA, name: "Smith", team: "Team A" },
      { _id: IDS.duplicate, name: "Smith", team: "Team A" },
    ]);
    const resolution = resolveLegacyIdentity("Smith", "Team A", sameTeam);
    assert.equal(resolution.status, "ambiguous");
    assert.equal(resolution.candidates.length, 2);
  });

  test("backfills participants, events, scorecards, awards, and free-hit state", () => {
    const index = buildPlayerIndex(players);
    const match = {
      teamA: "Team A",
      teamB: "Team B",
      squadA: ["Alex One", "Beth Two"],
      squadB: ["Chris Three"],
      innings1: {
        battingTeam: "Team A",
        bowlingTeam: "Team B",
        batsmen: [
          { name: "Alex One", runs: 1 },
          { name: "Beth Two", runs: 0 },
        ],
        bowlers: [{ name: "Chris Three", runs: 1 }],
        events: [
          { type: "ADD_BATTER", sequence: 1, playerName: "Alex One" },
          { type: "ADD_BATTER", sequence: 2, playerName: "Beth Two" },
          { type: "ADD_BOWLER", sequence: 3, playerName: "Chris Three" },
          {
            type: "BALL",
            sequence: 4,
            batterName: "Alex One",
            nonStrikerName: "Beth Two",
            bowlerName: "Chris Three",
            extraType: "noBall",
            legalDelivery: false,
          },
          {
            type: "BALL",
            sequence: 5,
            batterName: "Alex One",
            nonStrikerName: "Beth Two",
            bowlerName: "Chris Three",
            legalDelivery: true,
          },
        ],
        commentary: [{ batterName: "Alex One", bowlerName: "Chris Three" }],
      },
      statistics: {
        players: [{ name: "Alex One", runs: 1 }],
        manOfTheMatch: { name: "Alex One" },
      },
    };

    const result = migrateMatchIdentity(match, index);

    assert.equal(result.complete, true);
    assert.equal(result.issues.length, 0);
    assert.equal(match.schemaVersion, 3);
    assert.deepEqual(match.teamAParticipants, [
      { playerId: IDS.batterA, nameSnapshot: "Alex One" },
      { playerId: IDS.batterB, nameSnapshot: "Beth Two" },
    ]);
    assert.deepEqual(match.teamBParticipants, [
      { playerId: IDS.bowler, nameSnapshot: "Chris Three" },
    ]);
    assert.equal(match.innings1.batsmen[0].playerId, IDS.batterA);
    assert.equal(match.innings1.events[3].batterId, IDS.batterA);
    assert.equal(match.innings1.events[3].nonStrikerId, IDS.batterB);
    assert.equal(match.innings1.events[3].bowlerId, IDS.bowler);
    assert.equal(match.innings1.events[3].isFreeHit, false);
    assert.equal(match.innings1.events[4].isFreeHit, true);
    assert.equal(match.innings1.freeHitPending, false);
    assert.equal(match.statistics.players[0].playerId, IDS.batterA);
    assert.equal(match.statistics.manOfTheMatch.playerId, IDS.batterA);
  });

  test("flags a required missing event identity instead of marking migration complete", () => {
    const index = buildPlayerIndex(players);
    const event = {
      type: "BALL",
      batterName: "Alex One",
      bowlerName: "Chris Three",
      legalDelivery: true,
    };
    const issues = [];

    migrateEventIdentity(event, "Team A", "Team B", "innings1.events.0", index, issues);

    assert.equal(event.batterId, IDS.batterA);
    assert.equal(event.bowlerId, IDS.bowler);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].sourcePath, "innings1.events.0.nonStriker");
    assert.equal(issues[0].reason, "missing-name");
  });

  test("a wide and administrative dismissal preserve a pending free hit", () => {
    const events = [
      { type: "BALL", sequence: 1, extraType: "noBall", legalDelivery: false },
      { type: "BALL", sequence: 2, extraType: "wide", legalDelivery: false },
      { type: "BALL", sequence: 3, isWicket: true, wicketType: "retiredOut", legalDelivery: false },
      { type: "BALL", sequence: 4, legalDelivery: true },
    ];

    const pending = backfillFreeHitMarkers(events);

    assert.deepEqual(events.map((event) => event.isFreeHit), [false, true, true, true]);
    assert.equal(pending, false);
  });
});
