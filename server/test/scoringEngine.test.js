"use strict";

const assert = require("node:assert/strict");
const { describe, test } = require("node:test");
const mongoose = require("mongoose");

const {
  ADD_BATTER,
  ADD_BOWLER,
  END_INNINGS,
  ScoringError,
  activeBatters,
  canonicalizeBallEvent,
  clone,
  createControlEvent,
  deriveMatchState,
  emptyInningsState,
  formatOvers,
  rebuildInnings,
  validateInningsInvariants,
} = require("../services/scoringEngine");
const { serializeMatch } = require("../services/matchSerializer");

const FIXED_TIME = "2026-08-30T12:00:00.000Z";

const plain = (value) => JSON.parse(JSON.stringify(value));

const batter = (state, name) => state.batsmen.find((item) => item.name === name);
const bowler = (state, name) => state.bowlers.find((item) => item.name === name);
const strikerName = (state) => activeBatters(state).find((item) => item.isStriker)?.name;

class InningsHarness {
  constructor({
    battingTeam = "Team A",
    bowlingTeam = "Team B",
    inningsNumber = 1,
    setup = true,
  } = {}) {
    this.battingTeam = battingTeam;
    this.bowlingTeam = bowlingTeam;
    this.inningsNumber = inningsNumber;
    this.events = [];
    this.sequence = 0;

    if (setup) {
      this.addBatter("Alice", true);
      this.addBatter("Beth", false);
      this.addBowler("Blake");
    }
  }

  nextMetadata(prefix) {
    this.sequence += 1;
    return {
      actionId: `${prefix}-${this.inningsNumber}-${this.sequence}`,
      sequence: this.sequence,
      inningsNumber: this.inningsNumber,
      createdAt: FIXED_TIME,
    };
  }

  addBatter(name, isStriker) {
    const event = createControlEvent(ADD_BATTER, {
      ...this.nextMetadata("batter"),
      name,
      ...(typeof isStriker === "boolean" ? { isStriker } : {}),
    });
    this.events.push(event);
    return event;
  }

  addBowler(name) {
    const event = createControlEvent(ADD_BOWLER, {
      ...this.nextMetadata("bowler"),
      name,
    });
    this.events.push(event);
    return event;
  }

  end(reason = "declared") {
    const event = createControlEvent(END_INNINGS, {
      ...this.nextMetadata("end"),
      reason,
    });
    this.events.push(event);
    return event;
  }

  state(options = {}) {
    return rebuildInnings({
      battingTeam: this.battingTeam,
      bowlingTeam: this.bowlingTeam,
      events: this.events,
      ...options,
    });
  }

  ball(input = {}) {
    const before = this.state();
    const active = activeBatters(before);
    const selectedStriker = input.batterName || strikerName(before);
    const selectedNonStriker = input.nonStrikerName || active.find((item) => item.name !== selectedStriker)?.name;
    const selectedBowler = input.bowlerName || before.currentBowler || "Blake";
    const event = canonicalizeBallEvent({
      ...this.nextMetadata("ball"),
      batterName: selectedStriker,
      nonStrikerName: selectedNonStriker,
      bowlerName: selectedBowler,
      batsmanRuns: 0,
      extraRuns: 0,
      isFreeHit: before.freeHitPending,
      ...input,
    });
    this.events.push(event);
    return event;
  }

  undo() {
    return this.events.pop();
  }

  project(options = {}) {
    return {
      ...this.state(options),
      events: clone(this.events),
    };
  }
}

const completedInnings = ({
  battingTeam,
  bowlingTeam,
  runs,
  inningsNumber,
} = {}) => {
  const innings = new InningsHarness({ battingTeam, bowlingTeam, inningsNumber });
  if (runs > 0) innings.ball({ batsmanRuns: runs });
  innings.end();
  return innings;
};

const assertNonNegativeScorecard = (state) => {
  for (const value of [state.runs, state.wickets, state.balls, state.extras]) {
    assert.ok(Number.isInteger(value));
    assert.ok(value >= 0);
  }
  for (const item of state.batsmen) {
    for (const value of [item.runs, item.balls, item.fours, item.sixes]) {
      assert.ok(Number.isInteger(value));
      assert.ok(value >= 0);
    }
  }
  for (const item of state.bowlers) {
    for (const value of [item.balls, item.maidens, item.runs, item.wickets, item.wides, item.noBalls]) {
      assert.ok(Number.isInteger(value));
      assert.ok(value >= 0);
    }
  }
  assert.equal(validateInningsInvariants(state), true);
};

describe("scoringEngine: legal deliveries and ordinary runs", () => {
  test("formats overs from legal-ball counts instead of decimal arithmetic", () => {
    assert.equal(formatOvers(0), "0.0");
    assert.equal(formatOvers(5), "0.5");
    assert.equal(formatOvers(6), "1.0");
    assert.equal(formatOvers(14), "2.2");
  });

  for (const runs of [0, 1, 2, 3, 4, 5, 6]) {
    test(`${runs}-run delivery updates the authoritative total and raw player statistics`, () => {
      const innings = new InningsHarness();
      innings.ball({ batsmanRuns: runs });
      const state = innings.state();

      assert.equal(state.runs, runs);
      assert.equal(state.wickets, 0);
      assert.equal(state.balls, 1);
      assert.equal(state.extras, 0);
      assert.equal(batter(state, "Alice").runs, runs);
      assert.equal(batter(state, "Alice").balls, 1);
      assert.equal(batter(state, "Alice").fours, runs === 4 ? 1 : 0);
      assert.equal(batter(state, "Alice").sixes, runs === 6 ? 1 : 0);
      assert.equal(bowler(state, "Blake").balls, 1);
      assert.equal(bowler(state, "Blake").runs, runs);
      assert.equal(state.commentary.length, 1);
      assert.deepEqual(state.recentBalls, [String(runs)]);
      assertNonNegativeScorecard(state);
    });
  }

  test("odd completed runs rotate strike while even completed runs do not", () => {
    const innings = new InningsHarness();
    innings.ball({ batsmanRuns: 1 });
    assert.equal(strikerName(innings.state()), "Beth");

    innings.ball({ batsmanRuns: 2 });
    assert.equal(strikerName(innings.state()), "Beth");

    innings.ball({ batsmanRuns: 3 });
    assert.equal(strikerName(innings.state()), "Alice");
  });

  test("the sixth legal delivery closes the over, records a maiden, and swaps ends", () => {
    const innings = new InningsHarness();
    for (let index = 0; index < 6; index += 1) innings.ball();
    const state = innings.state();

    assert.equal(state.balls, 6);
    assert.equal(formatOvers(state.balls), "1.0");
    assert.equal(strikerName(state), "Beth");
    assert.equal(state.lastOverBowler, "Blake");
    assert.equal(state.overHistory.length, 1);
    assert.deepEqual(state.overHistory[0], {
      over: 1,
      runs: 0,
      wickets: 0,
      extras: 0,
      bowlerName: "Blake",
    });
    assert.equal(bowler(state, "Blake").maidens, 1);
  });

  test("odd-run strike rotation and the end-of-over swap are both applied", () => {
    const innings = new InningsHarness();
    innings.ball({ batsmanRuns: 1 });
    for (let index = 0; index < 5; index += 1) innings.ball();
    const state = innings.state();

    assert.equal(state.balls, 6);
    assert.equal(strikerName(state), "Alice");
  });

  test("the authoritative engine rejects a bowler change in the middle of an over", () => {
    const innings = new InningsHarness();
    innings.addBowler("Drew");
    innings.addBowler("Blake");
    innings.ball({ bowlerName: "Blake" });

    assert.throws(
      () => {
        innings.ball({ bowlerName: "Drew" });
        innings.state();
      },
      (error) => error instanceof ScoringError && error.code === "BOWLER_CHANGE_MID_OVER",
    );
  });

  test("an ADD_BOWLER control event cannot bypass the mid-over bowler lock", () => {
    const innings = new InningsHarness();
    innings.ball({ bowlerName: "Blake" });
    innings.addBowler("Drew");

    assert.throws(
      () => innings.state(),
      (error) => error instanceof ScoringError && error.code === "BOWLER_CHANGE_MID_OVER",
    );
  });

  test("an illegal delivery starts the over and locks its bowler", () => {
    const innings = new InningsHarness();
    innings.ball({ extraType: "wide", extraRuns: 1 });
    innings.addBowler("Brett");

    assert.throws(
      () => innings.state(),
      (error) => error instanceof ScoringError && error.code === "BOWLER_CHANGE_MID_OVER",
    );
  });

  test("a legacy partial-over baseline cannot be unlocked by a default false marker", () => {
    const innings = new InningsHarness();
    innings.ball();
    const baseline = plain(innings.state());
    baseline.currentOverStarted = false;
    const changeBowler = createControlEvent(ADD_BOWLER, {
      actionId: "legacy-change-bowler-1",
      sequence: innings.sequence + 1,
      inningsNumber: 1,
      name: "Brett",
      createdAt: FIXED_TIME,
    });

    assert.throws(
      () => rebuildInnings({
        battingTeam: innings.battingTeam,
        bowlingTeam: innings.bowlingTeam,
        baseline,
        events: [changeBowler],
      }),
      (error) => error instanceof ScoringError && error.code === "BOWLER_CHANGE_MID_OVER",
    );
  });
});

describe("scoringEngine: extras", () => {
  test("a wide adds one run without consuming a legal ball or batter ball", () => {
    const innings = new InningsHarness();
    innings.ball({ extraType: "wide", extraRuns: 1 });
    const state = innings.state();

    assert.equal(state.runs, 1);
    assert.equal(state.balls, 0);
    assert.equal(state.extras, 1);
    assert.equal(state.extrasBreakdown.wides, 1);
    assert.equal(batter(state, "Alice").balls, 0);
    assert.equal(bowler(state, "Blake").balls, 0);
    assert.equal(bowler(state, "Blake").runs, 1);
    assert.equal(bowler(state, "Blake").wides, 1);
    assert.equal(strikerName(state), "Alice");
    assert.deepEqual(state.recentBalls, ["Wd"]);
  });

  test("multiple wides are counted once and completed physical runs rotate strike", () => {
    const innings = new InningsHarness();
    innings.ball({ extraType: "wide", extraRuns: 1 });
    innings.ball({ extraType: "wide", extraRuns: 2 });
    const state = innings.state();

    assert.equal(state.runs, 3);
    assert.equal(state.balls, 0);
    assert.equal(state.extrasBreakdown.wides, 3);
    assert.equal(bowler(state, "Blake").runs, 3);
    assert.equal(bowler(state, "Blake").wides, 3);
    assert.equal(strikerName(state), "Beth");
    assert.deepEqual(state.recentBalls, ["Wd", "2Wd"]);
  });

  test("a no-ball adds its automatic extra and does not consume a legal ball", () => {
    const innings = new InningsHarness();
    innings.ball({ extraType: "noBall", extraRuns: 1 });
    const state = innings.state();

    assert.equal(state.runs, 1);
    assert.equal(state.balls, 0);
    assert.equal(state.extrasBreakdown.noBalls, 1);
    assert.equal(batter(state, "Alice").balls, 0);
    assert.equal(bowler(state, "Blake").balls, 0);
    assert.equal(bowler(state, "Blake").runs, 1);
    assert.equal(bowler(state, "Blake").noBalls, 1);
    assert.equal(strikerName(state), "Alice");
  });

  test("no-ball plus batsman runs separates team, batter, extra, and bowler totals", () => {
    const innings = new InningsHarness();
    innings.ball({ batsmanRuns: 4, extraType: "noBall", extraRuns: 1 });
    const state = innings.state();

    assert.equal(state.runs, 5);
    assert.equal(state.balls, 0);
    assert.equal(state.extras, 1);
    assert.equal(state.extrasBreakdown.noBalls, 1);
    assert.equal(batter(state, "Alice").runs, 4);
    assert.equal(batter(state, "Alice").balls, 0);
    assert.equal(batter(state, "Alice").fours, 1);
    assert.equal(bowler(state, "Blake").runs, 5);
    assert.equal(bowler(state, "Blake").noBalls, 1);
  });

  test("no-ball byes charge only the automatic no-ball to the bowler", () => {
    const innings = new InningsHarness();
    innings.ball({
      extraType: "noBall",
      extraRuns: 3,
      secondaryExtraType: "bye",
      completedRuns: 2,
    });
    const state = innings.state();

    assert.equal(state.runs, 3);
    assert.equal(state.extrasBreakdown.noBalls, 1);
    assert.equal(state.extrasBreakdown.byes, 2);
    assert.equal(bowler(state, "Blake").runs, 1);
    assert.equal(bowler(state, "Blake").noBalls, 1);
  });

  test("byes count as legal deliveries but are not charged to batter or bowler", () => {
    const innings = new InningsHarness();
    innings.ball({ extraType: "bye", extraRuns: 2 });
    const state = innings.state();

    assert.equal(state.runs, 2);
    assert.equal(state.balls, 1);
    assert.equal(state.extrasBreakdown.byes, 2);
    assert.equal(batter(state, "Alice").runs, 0);
    assert.equal(batter(state, "Alice").balls, 1);
    assert.equal(bowler(state, "Blake").balls, 1);
    assert.equal(bowler(state, "Blake").runs, 0);
    assert.equal(strikerName(state), "Alice");
  });

  test("an odd leg-bye rotates strike and is not charged to the bowler", () => {
    const innings = new InningsHarness();
    innings.ball({ extraType: "legBye", extraRuns: 1 });
    const state = innings.state();

    assert.equal(state.runs, 1);
    assert.equal(state.balls, 1);
    assert.equal(state.extrasBreakdown.legByes, 1);
    assert.equal(bowler(state, "Blake").runs, 0);
    assert.equal(strikerName(state), "Beth");
  });

  test("a wide in an otherwise scoreless over prevents a maiden", () => {
    const innings = new InningsHarness();
    innings.ball({ extraType: "wide", extraRuns: 1 });
    for (let index = 0; index < 6; index += 1) innings.ball();
    const state = innings.state();

    assert.equal(state.balls, 6);
    assert.equal(state.runs, 1);
    assert.equal(bowler(state, "Blake").maidens, 0);
    assert.equal(state.overHistory[0].extras, 1);
  });
});

describe("scoringEngine: free-hit state", () => {
  test("a no-ball marks the following delivery as a free hit", () => {
    const innings = new InningsHarness();
    const noBall = innings.ball({ extraType: "noBall", extraRuns: 1 });
    let state = innings.state();

    assert.equal(noBall.isFreeHit, false);
    assert.equal(state.freeHitPending, true);
    assert.equal(state.commentary[0].isFreeHit, false);

    const freeHit = innings.ball({ batsmanRuns: 1 });
    state = innings.state();
    assert.equal(freeHit.isFreeHit, true);
    assert.equal(state.freeHitPending, false);
    assert.equal(state.commentary[0].isFreeHit, true);
  });

  test("wides and repeated no-balls preserve a pending free hit until a legal ball", () => {
    const innings = new InningsHarness();
    innings.ball({ extraType: "noBall", extraRuns: 1 });
    const wide = innings.ball({ extraType: "wide", extraRuns: 1 });
    const repeatedNoBall = innings.ball({ extraType: "noBall", extraRuns: 1 });
    let state = innings.state();

    assert.equal(wide.isFreeHit, true);
    assert.equal(repeatedNoBall.isFreeHit, true);
    assert.equal(state.freeHitPending, true);

    innings.ball({ batsmanRuns: 2 });
    state = innings.state();
    assert.equal(state.freeHitPending, false);
  });

  test("a delivery wicket on a free hit is rejected and cannot be credited", () => {
    const innings = new InningsHarness();
    innings.ball({ extraType: "noBall", extraRuns: 1 });
    innings.ball({ isWicket: true, wicketType: "bowled", outPlayerName: "Alice" });

    assert.throws(
      () => innings.state(),
      (error) => error instanceof ScoringError && error.code === "WICKET_ON_FREE_HIT",
    );
    innings.undo();
    const state = innings.state();
    assert.equal(state.wickets, 0);
    assert.equal(bowler(state, "Blake").wickets, 0);
    assert.equal(state.freeHitPending, true);
  });

  test("a non-delivery dismissal does not consume the pending free hit", () => {
    const innings = new InningsHarness();
    innings.ball({ extraType: "noBall", extraRuns: 1 });
    innings.ball({
      isWicket: true,
      wicketType: "retiredOut",
      outPlayerName: "Beth",
      bowlerName: "",
    });
    const state = innings.state();

    assert.equal(state.wickets, 1);
    assert.equal(state.freeHitPending, true);
    assert.equal(bowler(state, "Blake").wickets, 0);
  });

  test("undo and disabled rules derive the pending flag deterministically", () => {
    const innings = new InningsHarness();
    innings.ball({ extraType: "noBall", extraRuns: 1 });
    innings.ball({ batsmanRuns: 4 });
    assert.equal(innings.state().freeHitPending, false);

    innings.undo();
    assert.equal(innings.state().freeHitPending, true);
    assert.equal(innings.state({ freeHitEnabled: false }).freeHitPending, false);
  });
});

describe("scoringEngine: wicket handling", () => {
  for (const wicketType of ["bowled", "caught", "lbw", "stumped", "hitWicket"]) {
    test(`${wicketType} is a team wicket credited to the bowler`, () => {
      const innings = new InningsHarness();
      innings.ball({
        isWicket: true,
        wicketType,
        outPlayerName: "Alice",
        ...(wicketType === "caught" || wicketType === "stumped" ? { fielderName: "Casey" } : {}),
      });
      const state = innings.state();

      assert.equal(state.runs, 0);
      assert.equal(state.wickets, 1);
      assert.equal(state.balls, 1);
      assert.equal(batter(state, "Alice").isOut, true);
      assert.equal(batter(state, "Alice").isActive, false);
      assert.equal(bowler(state, "Blake").wickets, 1);
      assert.equal(state.fallOfWickets.length, 1);
      assert.equal(state.fallOfWickets[0].score, "1-0");
    });
  }

  for (const wicketType of ["runOut", "retiredOut", "timedOut", "obstructingField", "hitBallTwice"]) {
    test(`${wicketType} is not credited to the bowler`, () => {
      const innings = new InningsHarness();
      innings.ball({
        isWicket: true,
        wicketType,
        outPlayerName: "Alice",
        ...(wicketType === "runOut" ? { fielderName: "Casey" } : {}),
      });
      const state = innings.state();

      assert.equal(state.wickets, 1);
      assert.equal(batter(state, "Alice").isOut, true);
      assert.equal(bowler(state, "Blake").wickets, 0);
    });
  }

  test("retired hurt removes the batter without recording a wicket", () => {
    const innings = new InningsHarness();
    innings.ball({ isWicket: true, wicketType: "retiredHurt", outPlayerName: "Alice" });
    const state = innings.state();

    assert.equal(state.wickets, 0);
    assert.equal(batter(state, "Alice").isOut, false);
    assert.equal(batter(state, "Alice").isActive, false);
    assert.equal(bowler(state, "Blake").wickets, 0);
    assert.equal(state.fallOfWickets.length, 0);
  });

  for (const wicketType of ["retiredHurt", "retiredOut", "timedOut"]) {
    test(`${wicketType} is a no-bowler administrative action and Undo restores its full state`, () => {
      const innings = new InningsHarness();
      const before = plain(innings.state());
      const event = innings.ball({
        batterName: "Alice",
        bowlerName: "",
        isWicket: true,
        wicketType,
        outPlayerName: "Alice",
      });
      const state = innings.state();

      assert.equal(event.nonDelivery, true);
      assert.equal(event.legalDelivery, false);
      assert.equal(event.bowlerName, "");
      assert.equal(state.runs, 0);
      assert.equal(state.balls, 0);
      assert.equal(state.wickets, wicketType === "retiredHurt" ? 0 : 1);
      assert.equal(batter(state, "Alice").balls, 0);
      assert.equal(bowler(state, "Blake").balls, 0);
      assert.equal(bowler(state, "Blake").runs, 0);
      assert.equal(bowler(state, "Blake").wickets, 0);
      assert.deepEqual(state.recentBalls, []);
      assert.equal(state.commentary.length, 1);

      innings.undo();
      assert.deepEqual(plain(innings.state()), before);
    });
  }

  test("run-out does not give the bowler a wicket and preserves completed runs", () => {
    const innings = new InningsHarness();
    innings.ball({
      batsmanRuns: 1,
      completedRuns: 1,
      isWicket: true,
      wicketType: "runOut",
      outPlayerName: "Alice",
      fielderName: "Casey",
    });
    const state = innings.state();

    assert.equal(state.runs, 1);
    assert.equal(state.wickets, 1);
    assert.equal(batter(state, "Alice").runs, 1);
    assert.equal(bowler(state, "Blake").wickets, 0);
    assert.equal(strikerName(state), "Beth");
  });

  test("a new batter takes strike after the striker is dismissed mid-over", () => {
    const innings = new InningsHarness();
    innings.ball({ isWicket: true, wicketType: "bowled", outPlayerName: "Alice" });
    let state = innings.state();

    assert.equal(activeBatters(state).length, 1);
    assert.equal(activeBatters(state)[0].name, "Beth");
    assert.equal(activeBatters(state)[0].isStriker, false, "the vacant striker end must remain vacant");

    innings.addBatter("Cara");
    state = innings.state();
    assert.equal(strikerName(state), "Cara");
    assert.deepEqual(activeBatters(state).map((item) => [item.name, item.isStriker]), [
      ["Beth", false],
      ["Cara", true],
    ]);
  });

  test("the striker stays on strike when the non-striker is run out mid-over", () => {
    const innings = new InningsHarness();
    innings.ball({
      isWicket: true,
      wicketType: "runOut",
      outPlayerName: "Beth",
      fielderName: "Casey",
    });
    let state = innings.state();

    assert.equal(strikerName(state), "Alice");
    innings.addBatter("Cara");
    state = innings.state();
    assert.equal(strikerName(state), "Alice");
    assert.deepEqual(activeBatters(state).map((item) => [item.name, item.isStriker]), [
      ["Alice", true],
      ["Cara", false],
    ]);
  });

  test("a wicket on the final delivery closes the over and leaves the correct survivor on strike", () => {
    const innings = new InningsHarness();
    for (let index = 0; index < 5; index += 1) innings.ball();
    innings.ball({ isWicket: true, wicketType: "bowled", outPlayerName: "Alice" });
    let state = innings.state();

    assert.equal(state.balls, 6);
    assert.equal(state.wickets, 1);
    assert.equal(state.overHistory.length, 1);
    assert.equal(state.overHistory[0].wickets, 1);
    assert.equal(strikerName(state), "Beth");

    innings.addBatter("Cara", false);
    state = innings.state();
    assert.equal(strikerName(state), "Beth");
    assert.deepEqual(activeBatters(state).map((item) => item.name), ["Beth", "Cara"]);
  });

  test("stumping from a wide is allowed, counts no legal ball, and credits the bowler", () => {
    const innings = new InningsHarness();
    innings.ball({
      extraType: "wide",
      extraRuns: 1,
      isWicket: true,
      wicketType: "stumped",
      outPlayerName: "Alice",
      fielderName: "Casey",
    });
    const state = innings.state();

    assert.equal(state.runs, 1);
    assert.equal(state.wickets, 1);
    assert.equal(state.balls, 0);
    assert.equal(bowler(state, "Blake").wickets, 1);
  });

  test("a bowled dismissal from a no-ball is rejected", () => {
    const innings = new InningsHarness();
    assert.throws(
      () => innings.ball({
        extraType: "noBall",
        extraRuns: 1,
        isWicket: true,
        wicketType: "bowled",
        outPlayerName: "Alice",
      }),
      (error) => error instanceof ScoringError && error.code === "INVALID_NO_BALL_WICKET",
    );
  });

  test("fielder-dependent dismissals require a recorded fielder", () => {
    const innings = new InningsHarness();
    for (const wicketType of ["caught", "stumped", "runOut"]) {
      assert.throws(
        () => innings.ball({ isWicket: true, wicketType, outPlayerName: "Alice" }),
        (error) => error instanceof ScoringError && error.code === "FIELDER_REQUIRED",
      );
    }
  });

  test("bowler dismissals cannot be smuggled in with bye extras", () => {
    const innings = new InningsHarness();
    assert.throws(
      () => innings.ball({
        extraType: "bye",
        extraRuns: 1,
        completedRuns: 0,
        isWicket: true,
        wicketType: "caught",
        outPlayerName: "Alice",
        fielderName: "Casey",
      }),
      (error) => error instanceof ScoringError && error.code === "INVALID_WICKET_EXTRAS",
    );
  });

  test("completed-run metadata cannot exceed the runs available on the action", () => {
    const innings = new InningsHarness();
    assert.throws(
      () => innings.ball({ batsmanRuns: 1, completedRuns: 3 }),
      (error) => error instanceof ScoringError && error.code === "INVALID_COMPLETED_RUNS",
    );
  });
});

describe("scoringEngine: player statistics, partnerships, and commentary", () => {
  test("same-name players remain distinct when their immutable IDs differ", () => {
    const batterOneId = "507f1f77bcf86cd799439101";
    const batterTwoId = "507f1f77bcf86cd799439102";
    const bowlerId = "507f1f77bcf86cd799439103";
    const events = [
      createControlEvent(ADD_BATTER, {
        actionId: "same-name-batter-one",
        sequence: 1,
        inningsNumber: 1,
        playerId: batterOneId,
        nameSnapshot: "Alex Smith",
        isStriker: true,
      }),
      createControlEvent(ADD_BATTER, {
        actionId: "same-name-batter-two",
        sequence: 2,
        inningsNumber: 1,
        playerId: batterTwoId,
        nameSnapshot: "Alex Smith",
        isStriker: false,
      }),
      createControlEvent(ADD_BOWLER, {
        actionId: "same-name-bowler-one",
        sequence: 3,
        inningsNumber: 1,
        playerId: bowlerId,
        nameSnapshot: "Jordan Lee",
      }),
      canonicalizeBallEvent({
        actionId: "same-name-score-one",
        sequence: 4,
        inningsNumber: 1,
        batterId: batterOneId,
        batterNameSnapshot: "Alex Smith",
        nonStrikerId: batterTwoId,
        nonStrikerNameSnapshot: "Alex Smith",
        bowlerId,
        bowlerNameSnapshot: "Jordan Lee",
        batsmanRuns: 4,
        extraRuns: 0,
        isFreeHit: false,
      }),
    ];

    const state = rebuildInnings({ battingTeam: "Team A", bowlingTeam: "Team B", events });
    const first = state.batsmen.find((player) => player.playerId === batterOneId);
    const second = state.batsmen.find((player) => player.playerId === batterTwoId);
    assert.equal(state.batsmen.length, 2);
    assert.equal(first.runs, 4);
    assert.equal(second.runs, 0);
    assert.equal(first.nameSnapshot, second.nameSnapshot);
  });

  test("one event stream deterministically derives every related scorecard value", () => {
    const innings = new InningsHarness();
    innings.ball({ batsmanRuns: 4, commentary: "FOUR through cover" });
    innings.ball({ batsmanRuns: 2, extraType: "noBall", extraRuns: 1 });
    innings.ball({ extraType: "bye", extraRuns: 2 });
    innings.ball({ isWicket: true, wicketType: "caught", outPlayerName: "Alice", fielderName: "Casey" });
    const state = innings.state();
    const alice = batter(state, "Alice");
    const blake = bowler(state, "Blake");

    assert.equal(state.runs, 9);
    assert.equal(state.extras, 3);
    assert.deepEqual(state.extrasBreakdown, {
      wides: 0,
      noBalls: 1,
      byes: 2,
      legByes: 0,
      penalties: 0,
      other: 0,
    });
    assert.equal(alice.runs, 6);
    assert.equal(alice.balls, 3);
    assert.equal(alice.fours, 1);
    assert.equal(alice.sixes, 0);
    assert.equal(Number(((alice.runs / alice.balls) * 100).toFixed(2)), 200);
    assert.equal(blake.balls, 3);
    assert.equal(blake.runs, 7);
    assert.equal(blake.wickets, 1);
    assert.equal(blake.noBalls, 1);
    assert.equal(Number((blake.runs / (blake.balls / 6)).toFixed(2)), 14);
    assert.equal(state.partnerships.length, 1);
    assert.equal(state.partnerships[0].runs, 9);
    assert.equal(state.partnerships[0].balls, 3);
    assert.equal(state.partnerships[0].isClosed, true);
    assert.equal(state.commentary.length, 4);
    assert.equal(state.commentary.at(-1).text, "FOUR through cover");
    assert.equal(state.fallOfWickets[0].score, "1-9");
    assertNonNegativeScorecard(state);
  });

  test("a new partnership starts after a wicket and is rebuilt after event removal", () => {
    const innings = new InningsHarness();
    innings.ball({ batsmanRuns: 4 });
    innings.ball({ isWicket: true, wicketType: "bowled", outPlayerName: "Alice" });
    innings.addBatter("Cara", false);
    innings.ball({ batsmanRuns: 1 });
    let state = innings.state();

    assert.equal(state.partnerships.length, 2);
    assert.equal(state.partnerships[0].runs, 4);
    assert.equal(state.partnerships[0].isClosed, true);
    assert.deepEqual(state.partnerships[1].players, ["Beth", "Cara"]);
    assert.equal(state.partnerships[1].runs, 1);

    innings.undo();
    state = innings.state();
    assert.equal(state.partnerships[1].runs, 0);

    innings.undo();
    innings.undo();
    state = innings.state();
    assert.equal(state.wickets, 0);
    assert.equal(state.fallOfWickets.length, 0);
    assert.equal(state.partnerships.length, 1);
    assert.equal(state.partnerships[0].runs, 4);
    assert.equal(state.partnerships[0].isClosed, false);
    assert.equal(batter(state, "Alice").isOut, false);
    assert.equal(state.commentary.length, 1);
  });
});

describe("scoringEngine: innings and match lifecycle", () => {
  test("an innings completes at the configured legal-ball limit", () => {
    const innings = new InningsHarness();
    for (let index = 0; index < 6; index += 1) innings.ball();
    const state = innings.state({ maxBalls: 6 });

    assert.equal(state.isDone, true);
    assert.equal(state.endReason, "oversComplete");
    assert.equal(state.balls, 6);
  });

  test("an innings completes at the configured wicket limit", () => {
    const innings = new InningsHarness();
    innings.ball({ isWicket: true, wicketType: "bowled", outPlayerName: "Alice" });
    innings.addBatter("Cara", false);
    innings.ball({ isWicket: true, wicketType: "caught", outPlayerName: "Beth", fielderName: "Casey" });
    const state = innings.state({ maxWickets: 2 });

    assert.equal(state.wickets, 2);
    assert.equal(state.isDone, true);
    assert.equal(state.endReason, "allOut");
  });

  test("ending the first innings initializes target and innings-break state without changing either score", () => {
    const first = completedInnings({
      battingTeam: "Team A",
      bowlingTeam: "Team B",
      inningsNumber: 1,
      runs: 10,
    });
    const second = new InningsHarness({ battingTeam: "Team B", bowlingTeam: "Team A", inningsNumber: 2 });
    const match = {
      teamA: "Team A",
      teamB: "Team B",
      status: "live",
      innings1: first.project(),
      innings2: second.project(),
    };

    deriveMatchState(match, { maxBalls: 12 });

    assert.equal(match.currentInnings, 2);
    assert.equal(match.phase, "inningsBreak");
    assert.equal(match.target, 11);
    assert.equal(match.requiredRuns, 11);
    assert.equal(match.requiredRunRate, 5.5);
    assert.equal(match.innings1.runs, 10);
    assert.equal(match.innings2.runs, 0);
    assert.notStrictEqual(match.innings1, match.innings2);
  });

  test("a successful chase finishes the match with wickets remaining", () => {
    const first = completedInnings({ battingTeam: "Team A", bowlingTeam: "Team B", inningsNumber: 1, runs: 5 });
    const second = new InningsHarness({ battingTeam: "Team B", bowlingTeam: "Team A", inningsNumber: 2 });
    second.ball({ batsmanRuns: 6 });
    const match = {
      teamA: "Team A",
      teamB: "Team B",
      innings1: first.project(),
      innings2: second.project({ target: 6 }),
    };

    deriveMatchState(match, { maxWickets: 10, maxBalls: 12 });

    assert.equal(match.status, "completed");
    assert.equal(match.phase, "finished");
    assert.equal(match.requiredRuns, 0);
    assert.equal(match.result, "Team B won by 10 wickets");
  });

  test("a defending team wins by the exact run margin", () => {
    const first = completedInnings({ battingTeam: "Team A", bowlingTeam: "Team B", inningsNumber: 1, runs: 10 });
    const second = completedInnings({ battingTeam: "Team B", bowlingTeam: "Team A", inningsNumber: 2, runs: 7 });
    const match = {
      teamA: "Team A",
      teamB: "Team B",
      innings1: first.project(),
      innings2: second.project(),
    };

    deriveMatchState(match, { maxWickets: 10, maxBalls: 12 });

    assert.equal(match.status, "completed");
    assert.equal(match.result, "Team A won by 3 runs");
    assert.equal(match.requiredRuns, 4);
  });

  test("equal completed innings produce a tie", () => {
    const first = completedInnings({ battingTeam: "Team A", bowlingTeam: "Team B", inningsNumber: 1, runs: 10 });
    const second = completedInnings({ battingTeam: "Team B", bowlingTeam: "Team A", inningsNumber: 2, runs: 10 });
    const match = {
      teamA: "Team A",
      teamB: "Team B",
      innings1: first.project(),
      innings2: second.project(),
    };

    deriveMatchState(match, { maxWickets: 10, maxBalls: 12 });

    assert.equal(match.status, "completed");
    assert.equal(match.result, "Match tied");
    assert.equal(match.requiredRuns, 1);
  });

  test("a chase after one wicket reports the correct wickets remaining", () => {
    const first = completedInnings({ battingTeam: "Team A", bowlingTeam: "Team B", inningsNumber: 1, runs: 5 });
    const second = new InningsHarness({ battingTeam: "Team B", bowlingTeam: "Team A", inningsNumber: 2 });
    second.ball({ isWicket: true, wicketType: "bowled", outPlayerName: "Alice" });
    second.addBatter("Cara", false);
    second.ball({ batsmanRuns: 6 });
    const match = {
      teamA: "Team A",
      teamB: "Team B",
      innings1: first.project(),
      innings2: second.project({ target: 6 }),
    };

    deriveMatchState(match, { maxWickets: 10, maxBalls: 12 });
    assert.equal(match.result, "Team B won by 9 wickets");
  });
});

describe("scoringEngine: event-removal undo and replay", () => {
  test("undoing one delivery restores every affected value", () => {
    const innings = new InningsHarness();
    const before = plain(innings.state());
    innings.ball({ batsmanRuns: 6 });
    innings.undo();
    const after = plain(innings.state());

    assert.deepEqual(after, before);
  });

  test("multiple undos and undo-until-start never create negative state", () => {
    const innings = new InningsHarness();
    innings.ball({ batsmanRuns: 1 });
    innings.ball({ batsmanRuns: 4 });
    innings.ball({ extraType: "wide", extraRuns: 1 });
    innings.ball({ extraType: "noBall", extraRuns: 1 });

    while (innings.events.length > 0) {
      innings.undo();
      assertNonNegativeScorecard(innings.state());
    }

    const state = innings.state();
    assert.equal(state.runs, 0);
    assert.equal(state.wickets, 0);
    assert.equal(state.balls, 0);
    assert.equal(state.batsmen.length, 0);
    assert.equal(state.bowlers.length, 0);
    assert.equal(innings.undo(), undefined);
    assertNonNegativeScorecard(innings.state());
  });

  test("undoing a wicket rebuilds batter, bowler, fall-of-wicket, partnership, and commentary state", () => {
    const innings = new InningsHarness();
    innings.ball({ batsmanRuns: 4 });
    const beforeWicket = plain(innings.state());
    innings.ball({ isWicket: true, wicketType: "caught", outPlayerName: "Alice", fielderName: "Casey" });
    innings.undo();
    const restored = plain(innings.state());

    assert.deepEqual(restored, beforeWicket);
    assert.equal(restored.wickets, 0);
    assert.equal(restored.fallOfWickets.length, 0);
    assert.equal(bowler(restored, "Blake").wickets, 0);
    assert.equal(batter(restored, "Alice").isOut, false);
    assert.equal(restored.commentary.length, 1);
  });

  test("undoing a wide and a no-ball removes their extras without consuming balls", () => {
    const innings = new InningsHarness();
    innings.ball({ extraType: "wide", extraRuns: 3 });
    innings.ball({ batsmanRuns: 4, extraType: "noBall", extraRuns: 1 });
    let state = innings.state();
    assert.equal(state.runs, 8);
    assert.equal(state.balls, 0);

    innings.undo();
    state = innings.state();
    assert.equal(state.runs, 3);
    assert.equal(state.extrasBreakdown.noBalls, 0);
    assert.equal(batter(state, "Alice").runs + batter(state, "Beth").runs, 0);

    innings.undo();
    state = innings.state();
    assert.equal(state.runs, 0);
    assert.equal(state.extras, 0);
    assert.equal(state.commentary.length, 0);
  });

  test("undoing END_INNINGS reopens the innings and removes its commentary", () => {
    const innings = new InningsHarness();
    innings.ball({ batsmanRuns: 4 });
    innings.end();
    let state = innings.state();
    assert.equal(state.isDone, true);
    assert.equal(state.commentary.length, 2);

    innings.undo();
    state = innings.state();
    assert.equal(state.isDone, false);
    assert.equal(state.endReason, "");
    assert.equal(state.runs, 4);
    assert.equal(state.commentary.length, 1);
  });

  test("undoing the winning ball returns a completed chase to live and reapplying it wins again", () => {
    const first = completedInnings({ battingTeam: "Team A", bowlingTeam: "Team B", inningsNumber: 1, runs: 5 });
    const second = new InningsHarness({ battingTeam: "Team B", bowlingTeam: "Team A", inningsNumber: 2 });
    second.ball({ batsmanRuns: 1 });
    second.ball({ batsmanRuns: 5 });

    const completed = {
      teamA: "Team A",
      teamB: "Team B",
      innings1: first.project(),
      innings2: second.project({ target: 6 }),
    };
    deriveMatchState(completed, { maxWickets: 10, maxBalls: 12 });
    assert.equal(completed.status, "completed");
    assert.equal(completed.result, "Team B won by 10 wickets");

    const winningEvent = second.undo();
    const reopened = {
      teamA: "Team A",
      teamB: "Team B",
      innings1: first.project(),
      innings2: second.project({ target: 6 }),
    };
    deriveMatchState(reopened, { maxWickets: 10, maxBalls: 12 });
    assert.equal(reopened.status, "live");
    assert.equal(reopened.phase, "secondInnings");
    assert.equal(reopened.result, "");
    assert.equal(reopened.requiredRuns, 5);

    second.events.push(winningEvent);
    const wonAgain = {
      teamA: "Team A",
      teamB: "Team B",
      innings1: first.project(),
      innings2: second.project({ target: 6 }),
    };
    deriveMatchState(wonAgain, { maxWickets: 10, maxBalls: 12 });
    assert.equal(wonAgain.status, "completed");
    assert.equal(wonAgain.result, "Team B won by 10 wickets");
  });

  test("undoing first-innings completion restores first-innings live state", () => {
    const first = completedInnings({ battingTeam: "Team A", bowlingTeam: "Team B", inningsNumber: 1, runs: 4 });
    const second = new InningsHarness({ battingTeam: "Team B", bowlingTeam: "Team A", inningsNumber: 2 });
    first.undo();
    const match = {
      teamA: "Team A",
      teamB: "Team B",
      innings1: first.project(),
      innings2: second.project(),
    };

    deriveMatchState(match, { maxWickets: 10, maxBalls: 12 });
    assert.equal(match.status, "live");
    assert.equal(match.phase, "firstInnings");
    assert.equal(match.currentInnings, 1);
    assert.equal(match.target, 0);
    assert.equal(match.result, "");
    assert.equal(match.innings1.runs, 4);
    assert.equal(match.innings2.runs, 0);
  });

  test("100 score/undo cycles are deterministic and never corrupt or grow state", () => {
    const innings = new InningsHarness();
    const baseline = plain(innings.state());

    for (let index = 0; index < 100; index += 1) {
      innings.ball({ batsmanRuns: index % 7 });
      assertNonNegativeScorecard(innings.state());
      innings.undo();
      const restored = innings.state();
      assertNonNegativeScorecard(restored);
      assert.deepEqual(plain(restored), baseline);
    }
  });
});

describe("scoringEngine: concurrency prerequisites, persistence, and invariants", () => {
  test("out-of-order storage is replayed by sequence number", () => {
    const innings = new InningsHarness();
    const one = innings.ball({ batsmanRuns: 1 });
    const four = innings.ball({ batsmanRuns: 4 });
    const expected = plain(innings.state());
    const setup = innings.events.slice(0, 3);
    const reversed = [...setup, four, one];

    const replayed = rebuildInnings({
      battingTeam: "Team A",
      bowlingTeam: "Team B",
      events: reversed,
    });
    assert.deepEqual(plain(replayed), expected);
  });

  test("two stale same-striker scoring candidates cannot silently replay as valid state", () => {
    const innings = new InningsHarness();
    const first = canonicalizeBallEvent({
      actionId: "concurrent-a",
      sequence: 4,
      inningsNumber: 1,
      batterName: "Alice",
      nonStrikerName: "Beth",
      bowlerName: "Blake",
      batsmanRuns: 1,
      extraRuns: 0,
      createdAt: FIXED_TIME,
    });
    const staleSecond = canonicalizeBallEvent({
      actionId: "concurrent-b",
      sequence: 5,
      inningsNumber: 1,
      batterName: "Alice",
      nonStrikerName: "Beth",
      bowlerName: "Blake",
      batsmanRuns: 1,
      extraRuns: 0,
      createdAt: FIXED_TIME,
    });

    assert.throws(
      () => rebuildInnings({
        battingTeam: "Team A",
        bowlingTeam: "Team B",
        events: [...innings.events, first, staleSecond],
      }),
      (error) => error instanceof ScoringError && error.code === "INVALID_STRIKER",
    );
  });

  test("parallel replays are deterministic and do not mutate shared input history", async () => {
    const innings = new InningsHarness();
    innings.ball({ batsmanRuns: 1 });
    innings.ball({ batsmanRuns: 2 });
    innings.ball({ extraType: "wide", extraRuns: 1 });
    const frozenInput = plain(innings.events);

    const replay = () => rebuildInnings({
      battingTeam: innings.battingTeam,
      bowlingTeam: innings.bowlingTeam,
      events: innings.events,
    });
    const [first, second] = await Promise.all([Promise.resolve().then(replay), Promise.resolve().then(replay)]);

    assert.notStrictEqual(first, second);
    assert.notStrictEqual(first.batsmen, second.batsmen);
    assert.deepEqual(plain(first), plain(second));
    assert.deepEqual(plain(innings.events), frozenInput);
  });

  test("JSON round-trip simulates restart recovery from persisted event history", () => {
    const innings = new InningsHarness();
    innings.ball({ batsmanRuns: 1 });
    innings.ball({ batsmanRuns: 4 });
    innings.ball({ extraType: "wide", extraRuns: 2 });
    innings.ball({ extraType: "legBye", extraRuns: 1 });
    const beforeRestart = innings.state();
    const persisted = JSON.parse(JSON.stringify({
      battingTeam: innings.battingTeam,
      bowlingTeam: innings.bowlingTeam,
      events: innings.events,
    }));

    const afterRestart = rebuildInnings(persisted);
    assert.deepEqual(plain(afterRestart), plain(beforeRestart));
  });

  test("a legacy baseline with two active batters repairs a missing striker deterministically", () => {
    const baseline = {
      battingTeam: "Team A",
      bowlingTeam: "Team B",
      batsmen: [
        { name: "Alice", isActive: true, isStriker: false },
        { name: "Beth", isActive: true, isStriker: false },
      ],
    };

    const firstReplay = rebuildInnings({
      battingTeam: "Team A",
      bowlingTeam: "Team B",
      baseline,
      events: [],
    });
    const secondReplay = rebuildInnings({
      battingTeam: "Team A",
      bowlingTeam: "Team B",
      baseline: plain(baseline),
      events: [],
    });

    assert.equal(activeBatters(firstReplay).filter((item) => item.isStriker).length, 1);
    assert.equal(strikerName(firstReplay), "Alice");
    assert.deepEqual(plain(firstReplay), plain(secondReplay));
  });

  test("event-derived score satisfies total, extras, and player-stat invariants", () => {
    const innings = new InningsHarness();
    innings.ball({ batsmanRuns: 1 });
    innings.ball({ batsmanRuns: 4 });
    innings.ball({ extraType: "wide", extraRuns: 2 });
    innings.ball({ extraType: "noBall", batsmanRuns: 2, extraRuns: 1 });
    innings.ball({ extraType: "bye", extraRuns: 3 });
    innings.ball({ extraType: "legBye", extraRuns: 1 });
    const state = innings.state();

    const eventRuns = innings.events
      .filter((event) => event.type === "BALL")
      .reduce((sum, event) => sum + event.batsmanRuns + event.extraRuns, 0);
    const batterRuns = state.batsmen.reduce((sum, item) => sum + item.runs, 0);
    const extras = Object.values(state.extrasBreakdown).reduce((sum, value) => sum + value, 0);

    assert.equal(state.runs, eventRuns);
    assert.equal(state.runs, batterRuns + extras);
    assert.equal(state.extras, extras);
    assert.notEqual(activeBatters(state)[0]?.name, activeBatters(state)[1]?.name);
    assertNonNegativeScorecard(state);
  });

  test("malformed numeric scoring input is rejected rather than coerced to a dot ball", () => {
    assert.throws(
      () => canonicalizeBallEvent({
        batterName: "Alice",
        bowlerName: "Blake",
        runs: "not-a-number",
      }),
      (error) => error instanceof ScoringError && error.code === "INVALID_RUNS",
    );
  });

  test("negative runs, invalid extras, and missing participants are rejected", () => {
    assert.throws(
      () => canonicalizeBallEvent({ batterName: "Alice", bowlerName: "Blake", batsmanRuns: -1, extraRuns: 0 }),
      (error) => error.code === "INVALID_BATSMAN_RUNS",
    );
    assert.throws(
      () => canonicalizeBallEvent({ batterName: "Alice", bowlerName: "Blake", batsmanRuns: 0, extraRuns: 1 }),
      (error) => error.code === "MISSING_EXTRA_TYPE",
    );
    assert.throws(
      () => canonicalizeBallEvent({ batsmanRuns: 0, extraRuns: 0, bowlerName: "Blake" }),
      (error) => error.code === "STRIKER_REQUIRED",
    );
    assert.throws(
      () => canonicalizeBallEvent({ batsmanRuns: 0, extraRuns: 0, batterName: "Alice" }),
      (error) => error.code === "BOWLER_REQUIRED",
    );
  });
});

describe("scoringEngine: requested full live-match regression simulation", () => {
  test("score, undo, re-score, innings switch, chase, undo winner, and win again remain consistent", () => {
    const first = new InningsHarness({
      battingTeam: "Team A",
      bowlingTeam: "Team B",
      inningsNumber: 1,
    });

    // 1, 4, wide, 2, wicket, 6, 1: six legal balls, 15/1.
    first.ball({ batsmanRuns: 1 });
    first.ball({ batsmanRuns: 4 });
    first.ball({ extraType: "wide", extraRuns: 1 });
    first.ball({ batsmanRuns: 2 });
    first.ball({ isWicket: true, wicketType: "bowled", outPlayerName: "Beth" });
    first.addBatter("Cara", false);
    first.ball({ batsmanRuns: 6 });
    first.ball({ batsmanRuns: 1 });
    let firstState = first.state();
    assert.equal(firstState.runs, 15);
    assert.equal(firstState.wickets, 1);
    assert.equal(firstState.balls, 6);
    assert.equal(formatOvers(firstState.balls), "1.0");
    assert.equal(firstState.extrasBreakdown.wides, 1);
    assert.equal(firstState.fallOfWickets[0].score, "1-8");
    assertNonNegativeScorecard(firstState);

    // Undo two shots, then replace them with a four and a two.
    first.undo();
    first.undo();
    firstState = first.state();
    assert.equal(firstState.runs, 8);
    assert.equal(firstState.wickets, 1);
    assert.equal(firstState.balls, 4);
    first.ball({ batsmanRuns: 4 });
    first.ball({ batsmanRuns: 2 });
    firstState = first.state();
    assert.equal(firstState.runs, 14);
    assert.equal(firstState.wickets, 1);
    assert.equal(firstState.balls, 6);
    assert.equal(firstState.commentary.length, 7);
    assertNonNegativeScorecard(firstState);

    first.end();
    firstState = first.state();
    assert.equal(firstState.isDone, true);
    assert.equal(firstState.runs, 14);

    const second = new InningsHarness({
      battingTeam: "Team B",
      bowlingTeam: "Team A",
      inningsNumber: 2,
    });
    let match = {
      teamA: "Team A",
      teamB: "Team B",
      innings1: first.project(),
      innings2: second.project(),
    };
    deriveMatchState(match, { maxWickets: 10, maxBalls: 12 });
    assert.equal(match.target, 15);
    assert.equal(match.innings1.runs, 14);
    assert.equal(match.innings2.runs, 0);
    assert.equal(match.phase, "inningsBreak");

    // Build the chase to 14, then cross the target with the next delivery.
    second.ball({ batsmanRuns: 4 });
    second.ball({ extraType: "wide", extraRuns: 1 });
    second.ball({ batsmanRuns: 6 });
    second.ball({ batsmanRuns: 3 });
    match = {
      teamA: "Team A",
      teamB: "Team B",
      innings1: first.project(),
      innings2: second.project({ target: 15 }),
    };
    deriveMatchState(match, { maxWickets: 10, maxBalls: 12 });
    assert.equal(match.status, "live");
    assert.equal(match.phase, "secondInnings");
    assert.equal(match.requiredRuns, 1);
    assert.equal(match.innings1.runs, 14);
    assert.equal(match.innings2.runs, 14);

    second.ball({ batsmanRuns: 1 });
    match = {
      teamA: "Team A",
      teamB: "Team B",
      innings1: first.project(),
      innings2: second.project({ target: 15 }),
    };
    deriveMatchState(match, { maxWickets: 10, maxBalls: 12 });
    assert.equal(match.status, "completed");
    assert.equal(match.requiredRuns, 0);
    assert.equal(match.result, "Team B won by 10 wickets");
    assert.equal(match.innings1.runs, 14);

    const winningEvent = second.undo();
    match = {
      teamA: "Team A",
      teamB: "Team B",
      innings1: first.project(),
      innings2: second.project({ target: 15 }),
    };
    deriveMatchState(match, { maxWickets: 10, maxBalls: 12 });
    assert.equal(match.status, "live");
    assert.equal(match.result, "");
    assert.equal(match.requiredRuns, 1);
    assert.equal(match.innings1.runs, 14);
    assert.equal(match.innings2.runs, 14);

    second.events.push(winningEvent);
    match = {
      teamA: "Team A",
      teamB: "Team B",
      innings1: first.project(),
      innings2: second.project({ target: 15 }),
    };
    deriveMatchState(match, { maxWickets: 10, maxBalls: 12 });
    const viewer = serializeMatch(match);
    assert.equal(match.status, "completed");
    assert.equal(match.result, "Team B won by 10 wickets");
    assert.equal(viewer.teamScores.teamA.score.runs, 14);
    assert.equal(viewer.teamScores.teamB.score.runs, 15);
    assert.notStrictEqual(viewer.teamScores.teamA.score, viewer.teamScores.teamB.score);
    assertNonNegativeScorecard(match.innings1);
    assertNonNegativeScorecard(match.innings2);
  });
});

describe("matchSerializer: viewer consistency and innings independence", () => {
  test("updating Team A cannot update Team B through a shared innings reference", () => {
    const first = new InningsHarness({ battingTeam: "Team A", bowlingTeam: "Team B", inningsNumber: 1 });
    first.ball({ batsmanRuns: 4 });
    const second = new InningsHarness({ battingTeam: "Team B", bowlingTeam: "Team A", inningsNumber: 2 });
    const match = {
      teamA: "Team A",
      teamB: "Team B",
      currentInnings: 1,
      innings1: first.project(),
      innings2: second.project(),
      eventSequence: first.sequence,
      __v: 7,
      redoStack: [],
    };
    const response = serializeMatch(match);

    assert.equal(response.teamScores.teamA.score.runs, 4);
    assert.equal(response.teamScores.teamA.score.wickets, 0);
    assert.equal(response.teamScores.teamB.score.runs, 0);
    assert.equal(response.teamScores.teamB.score.wickets, 0);
    assert.notStrictEqual(response.teamScores.teamA.score, response.teamScores.teamB.score);
    assert.notStrictEqual(response.innings1, response.innings2);

    response.teamScores.teamA.score.runs = 99;
    assert.equal(response.teamScores.teamB.score.runs, 0);
    assert.equal(match.innings1.runs, 4);
    assert.equal(match.innings2.runs, 0);
  });

  test("viewer team scores are mapped by batting team even when Team B bats first", () => {
    const first = new InningsHarness({ battingTeam: "Team B", bowlingTeam: "Team A", inningsNumber: 1 });
    first.ball({ batsmanRuns: 6 });
    first.end();
    const second = new InningsHarness({ battingTeam: "Team A", bowlingTeam: "Team B", inningsNumber: 2 });
    second.ball({ batsmanRuns: 1 });
    const response = serializeMatch({
      teamA: "Team A",
      teamB: "Team B",
      currentInnings: 2,
      innings1: first.project(),
      innings2: second.project(),
      redoStack: [],
    });

    assert.equal(response.teamScores.teamA.score.runs, 1);
    assert.equal(response.teamScores.teamB.score.runs, 6);
    assert.equal(response.teamScores.teamA.score.overs, "0.1");
    assert.equal(response.teamScores.teamB.score.overs, "0.1");
  });

  test("serializer returns undo metadata but does not leak event or snapshot history", () => {
    const first = new InningsHarness();
    first.ball({ batsmanRuns: 2 });
    const response = serializeMatch({
      teamA: "Team A",
      teamB: "Team B",
      currentInnings: 1,
      innings1: { ...first.project(), historyBase: emptyInningsState("Team A", "Team B") },
      processedActions: [{ actionId: "secret-internal-id" }],
      redoStack: [],
    });

    assert.equal(response.canUndo, true);
    assert.equal(response.canRedo, false);
    assert.equal(response.innings1.canUndo, true);
    assert.equal("events" in response.innings1, false);
    assert.equal("historyBase" in response.innings1, false);
    assert.equal("processedActions" in response, false);
  });

  test("serializer redacts replay internals from every innings without mutating its source", () => {
    const secretEvent = {
      type: "COMMENTARY",
      actionId: "private-action-id-0001",
      sequence: 8,
      inningsNumber: 1,
      commentary: "internal event",
    };
    const internalInnings = (battingTeam, bowlingTeam) => ({
      ...emptyInningsState(battingTeam, bowlingTeam),
      events: [secretEvent],
      historyBase: { privateSnapshot: true },
      historyBoundaryReason: "legacy-score-import",
      redoStack: [{ event: secretEvent }],
      rulesVersion: 1,
    });
    const source = {
      teamA: "Team A",
      teamB: "Team B",
      currentInnings: 1,
      innings1: internalInnings("Team A", "Team B"),
      innings2: internalInnings("Team B", "Team A"),
      superOverInnings1: internalInnings("Team B", "Team A"),
      superOverInnings2: internalInnings("Team A", "Team B"),
      processedActions: [{ actionId: "private-receipt-id-0001", operation: "SCORE_BALL" }],
      redoStack: [{ key: "innings1", event: secretEvent }],
      eventSequence: 8,
      __v: 3,
    };
    const sourceBefore = plain(source);
    const response = serializeMatch(source);

    for (const key of ["innings1", "innings2", "superOverInnings1", "superOverInnings2"]) {
      for (const privateField of ["events", "historyBase", "historyBoundaryReason", "redoStack", "rulesVersion"]) {
        assert.equal(privateField in response[key], false, `${key}.${privateField} must be private`);
      }
    }
    assert.equal("processedActions" in response, false);
    assert.equal("redoStack" in response, false);
    assert.doesNotMatch(JSON.stringify(response), /private-(?:action|receipt)-id/);
    assert.deepEqual(plain(source), sourceBefore, "serialization must not mutate the stored match");
  });

  test("serializer preserves BSON ObjectIds in lean authoritative match records", () => {
    const matchId = new mongoose.Types.ObjectId("507f1f77bcf86cd799439011");
    const tournamentId = new mongoose.Types.ObjectId("507f191e810c19729de860ea");
    const response = serializeMatch({
      _id: matchId,
      tournament: tournamentId,
      teamA: "Team A",
      teamB: "Team B",
      innings1: emptyInningsState("Team A", "Team B"),
      currentInnings: 1,
    });

    assert.equal(response._id, "507f1f77bcf86cd799439011");
    assert.equal(response.tournament, "507f191e810c19729de860ea");
    assert.equal(matchId.toHexString(), "507f1f77bcf86cd799439011");
  });

  test("fresh innings and cloned match payloads never share nested score objects", () => {
    const first = emptyInningsState("Team A", "Team B");
    const second = emptyInningsState("Team B", "Team A");
    assert.notStrictEqual(first, second);
    assert.notStrictEqual(first.extrasBreakdown, second.extrasBreakdown);
    assert.notStrictEqual(first.batsmen, second.batsmen);

    first.runs = 45;
    first.extrasBreakdown.wides = 2;
    assert.equal(second.runs, 0);
    assert.equal(second.extrasBreakdown.wides, 0);
  });
});
