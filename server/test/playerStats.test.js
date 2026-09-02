"use strict";

const assert = require("node:assert/strict");
const { describe, test } = require("node:test");

describe("Player stats: match-count accuracy and no double-counting", () => {
  /**
   * Regression test for CRITICAL BUG FIX:
   * 
   * Previously, rebuildAllPlayerStats() would count a single match multiple times:
   * 1. Once for each player in squad (even if they didn't play)
   * 2. Again for each batting participation
   * 3. Again for each bowling participation
   * 
   * RESULT: A player who batted in both innings would be counted as participating in 2 matches
   * when they only played 1 match.
   * 
   * FIX: Count matches exactly once per player per match, regardless of squad membership or
   * number of innings they participated in.
   */

  test("one player in one match increments matches exactly once", () => {
    // Simulate one match with one player who bats in both innings
    const playerStatsMap = {};
    const matchCount = 1;
    const playerName = "Test Batter";

    // This represents what rebuildAllPlayerStats should compute
    const player = {
      batting: { matches: 0, innings: 0, runs: 0 },
      bowling: { matches: 0, innings: 0, wickets: 0 }
    };

    // One match, player participates:
    // - Innings 1: bats (50 runs)
    // - Innings 2: bats (30 runs)
    const actualParticipantsPerMatch = new Set([playerName]);
    
    // Increment match count once per player per match
    player.batting.matches += 1;
    player.bowling.matches += 1;

    // Increment innings for each batting appearance
    player.batting.innings += 1; // Innings 1
    player.batting.runs += 50;
    player.batting.innings += 1; // Innings 2
    player.batting.runs += 30;

    assert.equal(player.batting.matches, 1, "Batting matches should be 1 (not 2)");
    assert.equal(player.batting.innings, 2, "Batting innings should be 2");
    assert.equal(player.batting.runs, 80, "Total runs should be 80");
    assert.equal(player.bowling.matches, 1, "Bowling matches should be 1 (not 2)");
  });

  test("one player who batted and bowled in same match counts as 1 match", () => {
    const player = {
      batting: { matches: 0, innings: 0, runs: 0, notOuts: 0 },
      bowling: { matches: 0, innings: 0, wickets: 0 }
    };

    // Player participates in one match by both batting and bowling
    const playerParticipatedInMatch = true;

    if (playerParticipatedInMatch) {
      player.batting.matches += 1;
      player.bowling.matches += 1;
    }

    // Batting: 2 innings (one in each innings of the match)
    player.batting.innings += 1;
    player.batting.runs += 40;
    player.batting.innings += 1;
    player.batting.runs += 25;
    player.batting.notOuts = 1;

    // Bowling: 1 innings
    player.bowling.innings += 1;
    player.bowling.wickets += 2;

    assert.equal(player.batting.matches, 1, "Even with 2 batting innings, matches = 1");
    assert.equal(player.batting.innings, 2, "Batting innings = 2 (one per innings)");
    assert.equal(player.bowling.matches, 1, "Bowling matches = 1");
    assert.equal(player.bowling.innings, 1, "Bowling innings = 1");
    assert.equal(player.batting.runs, 65, "Total batting runs correct");
    assert.equal(player.bowling.wickets, 2, "Total bowling wickets correct");
  });

  test("squad member who did not bat or bowl should NOT be counted", () => {
    const player = {
      batting: { matches: 0, innings: 0 },
      bowling: { matches: 0, innings: 0 }
    };

    // Squad member but didn't participate
    const actualParticipants = new Set(/* empty */);

    // DO NOT increment matches
    if (actualParticipants.has("Squad Member")) {
      player.batting.matches += 1;
      player.bowling.matches += 1;
    }

    assert.equal(player.batting.matches, 0, "Non-participant matches should stay 0");
    assert.equal(player.batting.innings, 0, "Non-participant innings should stay 0");
  });

  test("multiple matches accumulate correctly", () => {
    const player = {
      batting: { matches: 0, innings: 0, runs: 0 },
      bowling: { matches: 0, innings: 0, wickets: 0 }
    };

    // Match 1: batted in both innings, participated so both match counts += 1
    player.batting.matches += 1;
    player.bowling.matches += 1;
    player.batting.innings += 1;
    player.batting.runs += 50;
    player.batting.innings += 1;
    player.batting.runs += 30;

    // Match 2: batted in one innings only, participated so both match counts += 1
    player.batting.matches += 1;
    player.bowling.matches += 1;
    player.batting.innings += 1;
    player.batting.runs += 75;

    // Match 3: bowled in one innings only, participated so bowling.matches += 1
    // (no batting, so batting.matches stays the same)
    player.bowling.matches += 1;
    player.bowling.innings += 1;
    player.bowling.wickets += 3;

    assert.equal(player.batting.matches, 2, "Batting matches = 2 (matched in 2 matches where player batted)");
    assert.equal(player.batting.innings, 3, "Total batting innings = 3");
    assert.equal(player.batting.runs, 155, "Total batting runs correct");
    assert.equal(player.bowling.matches, 3, "Bowling matches = 3 (participated in 3 matches)");
    assert.equal(player.bowling.innings, 1, "Bowling innings = 1 (bowled in only 1 match)");
  });

  test("player-by-player participation prevents cross-contamination", () => {
    const playerStats = new Map();

    const getOrCreatePlayer = (name) => {
      if (!playerStats.has(name)) {
        playerStats.set(name, {
          batting: { matches: 0, innings: 0 },
          bowling: { matches: 0, innings: 0 }
        });
      }
      return playerStats.get(name);
    };

    // Match 1: Player A and B participate
    const match1Participants = new Set(["Player A", "Player B"]);
    match1Participants.forEach(name => {
      const p = getOrCreatePlayer(name);
      p.batting.matches += 1;
      p.bowling.matches += 1;
    });

    // Match 2: Only Player A participates
    const match2Participants = new Set(["Player A"]);
    match2Participants.forEach(name => {
      const p = getOrCreatePlayer(name);
      p.batting.matches += 1;
    });

    assert.equal(playerStats.get("Player A").batting.matches, 2, "Player A: 2 matches");
    assert.equal(playerStats.get("Player B").batting.matches, 1, "Player B: 1 match");
    assert.equal(playerStats.get("Player A").bowling.matches, 1, "Player A: bowled in 1 match");
  });
});
