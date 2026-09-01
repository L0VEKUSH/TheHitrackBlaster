"use strict";

const assert = require("node:assert/strict");
const { after, describe, test } = require("node:test");
const express = require("express");
const jwt = require("jsonwebtoken");

const Match = require("../models/Match");
const { Admin } = require("../models/other");
const playerController = require("../controllers/playerController");
const liveScoringController = require("../controllers/liveScoringController");
const matchRoutes = require("../routes/matchRoutes");
const {
  ADD_BATTER,
  ADD_BOWLER,
  END_INNINGS,
  activeBatters,
  canonicalizeBallEvent,
  clone,
  createControlEvent,
  rebuildInnings,
} = require("../services/scoringEngine");

const FIXED_TIME = "2026-08-30T12:00:00.000Z";
const MATCH_ID = "507f1f77bcf86cd799439011";

// Completed scoring mutations schedule a derived-stat rebuild. Stub that external
// database job so this controller suite remains hermetic and never opens MongoDB.
const originalRebuildAllPlayerStats = playerController.rebuildAllPlayerStats;
playerController.rebuildAllPlayerStats = async () => {};
after(async () => {
  await new Promise((resolve) => setImmediate(resolve));
  playerController.rebuildAllPlayerStats = originalRebuildAllPlayerStats;
});

class EventHistory {
  constructor({ battingTeam, bowlingTeam, inningsNumber, startSequence = 0 }) {
    this.battingTeam = battingTeam;
    this.bowlingTeam = bowlingTeam;
    this.inningsNumber = inningsNumber;
    this.sequence = startSequence;
    this.events = [];
    this.addBatter(`${battingTeam} Batter 1`, true);
    this.addBatter(`${battingTeam} Batter 2`, false);
    this.addBowler(`${bowlingTeam} Bowler 1`);
  }

  metadata(prefix) {
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
      ...this.metadata("setup-batter"),
      name,
      isStriker,
    });
    this.events.push(event);
    return event;
  }

  addBowler(name) {
    const event = createControlEvent(ADD_BOWLER, {
      ...this.metadata("setup-bowler"),
      name,
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
    const state = this.state();
    const active = activeBatters(state);
    const striker = input.batterName || active.find((item) => item.isStriker)?.name;
    const event = canonicalizeBallEvent({
      ...this.metadata("history-ball"),
      batterName: striker,
      nonStrikerName: input.nonStrikerName || active.find((item) => item.name !== striker)?.name,
      bowlerName: input.bowlerName || state.currentBowler,
      batsmanRuns: 0,
      extraRuns: 0,
      ...input,
    });
    this.events.push(event);
    return event;
  }

  end() {
    const event = createControlEvent(END_INNINGS, {
      ...this.metadata("history-end"),
      reason: "declared",
    });
    this.events.push(event);
    return event;
  }

  project(options = {}) {
    return { ...this.state(options), events: clone(this.events), historyBase: null, redoStack: [], rulesVersion: 1 };
  }
}

const makeDocument = (fields = {}, saveImplementation) => {
  const document = {
    _id: MATCH_ID,
    teamA: "Team A",
    teamB: "Team B",
    format: "T20",
    overs: 2,
    status: "live",
    phase: "firstInnings",
    currentInnings: 1,
    eventSequence: 3,
    processedActions: [],
    redoStack: [],
    __v: 0,
    saveCount: 0,
    ...fields,
  };

  Object.defineProperties(document, {
    markModified: {
      value() {},
      enumerable: false,
    },
    toObject: {
      value() {
        return JSON.parse(JSON.stringify(this));
      },
      enumerable: false,
    },
    save: {
      value: async function save() {
        this.saveCount += 1;
        if (saveImplementation) return saveImplementation.call(this);
        this.__v += 1;
        return this;
      },
      enumerable: false,
    },
  });
  return document;
};

const makeLiveDocument = (fields = {}, saveImplementation) => {
  const history = new EventHistory({ battingTeam: "Team A", bowlingTeam: "Team B", inningsNumber: 1 });
  return makeDocument({
    innings1: history.project(),
    eventSequence: history.sequence,
    ...fields,
  }, saveImplementation);
};

const persistedFields = (document) => JSON.parse(JSON.stringify(document));

const request = ({ body = {}, headers = {}, id = MATCH_ID } = {}) => {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]),
  );
  return {
    params: { id },
    body,
    get(name) {
      return normalizedHeaders[String(name).toLowerCase()];
    },
  };
};

const responseRecorder = () => ({
  statusCode: 200,
  body: undefined,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

const scoreRequest = ({ actionId, expectedVersion, runs = 1 } = {}) => request({
  headers: {
    "Idempotency-Key": actionId,
    "If-Match-Version": expectedVersion,
  },
  body: {
    inningsNum: 1,
    batterName: "Team A Batter 1",
    nonStrikerName: "Team A Batter 2",
    bowlerName: "Team B Bowler 1",
    batsmanRuns: runs,
    extraRuns: 0,
  },
});

const withFindById = async (implementation, work) => {
  const original = Match.findById;
  Match.findById = implementation;
  try {
    return await work();
  } finally {
    Match.findById = original;
  }
};

describe("liveScoringController without a database", { concurrency: false }, () => {
  test("requires a valid idempotency key and expected version before loading a match", async () => {
    let databaseReads = 0;
    await withFindById(async () => {
      databaseReads += 1;
      return makeLiveDocument();
    }, async () => {
      const noActionResponse = responseRecorder();
      await liveScoringController.updateScore(scoreRequest({ actionId: "", expectedVersion: 0 }), noActionResponse);
      assert.equal(noActionResponse.statusCode, 400);
      assert.equal(noActionResponse.body.code, "ACTION_ID_REQUIRED");

      const noVersionResponse = responseRecorder();
      const noVersionRequest = scoreRequest({ actionId: "score-action-no-version", expectedVersion: 0 });
      delete noVersionRequest.get;
      noVersionRequest.get = (name) => name.toLowerCase() === "idempotency-key" ? "score-action-no-version" : undefined;
      await liveScoringController.updateScore(noVersionRequest, noVersionResponse);
      assert.equal(noVersionResponse.statusCode, 428);
      assert.equal(noVersionResponse.body.code, "VERSION_REQUIRED");
    });
    assert.equal(databaseReads, 0);
  });

  test("the authenticated score route accepts the admin flat payload contract", async () => {
    const match = makeLiveDocument();
    const originalFindById = Match.findById;
    const originalAdminFindById = Admin.findById;
    const originalJwtSecret = process.env.JWT_SECRET;
    const jwtSecret = "route-test-jwt-secret-that-is-long-enough";
    let server;

    try {
      process.env.JWT_SECRET = jwtSecret;
      Match.findById = async () => match;
      Admin.findById = () => ({
        select: async () => ({ _id: MATCH_ID, isActive: true, role: "admin" }),
      });

      const app = express();
      app.use(express.json());
      app.use("/api/matches", matchRoutes);
      server = await new Promise((resolve) => {
        const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
      });
      const address = server.address();
      const token = jwt.sign({ id: MATCH_ID, type: "admin" }, jwtSecret, { algorithm: "HS256" });
      const response = await fetch(`http://127.0.0.1:${address.port}/api/matches/${MATCH_ID}/score`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Idempotency-Key": "route-flat-score-0001",
          "If-Match-Version": "0",
        },
        body: JSON.stringify({
          inningsNum: 1,
          runs: 1,
          isWicket: false,
          extraType: "",
          batterName: "Team A Batter 1",
          bowlerName: "Team B Bowler 1",
        }),
      });
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.equal(payload.success, true);
      assert.equal(payload.match.innings1.runs, 1);
      assert.notEqual(payload.message, "Action required");
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve));
      Match.findById = originalFindById;
      Admin.findById = originalAdminFindById;
      if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = originalJwtSecret;
    }
  });

  test("one score persists once; retry is idempotent; reused IDs and stale versions conflict", async () => {
    const match = makeLiveDocument();
    const actionId = "score-action-0001";

    await withFindById(async () => match, async () => {
      const firstResponse = responseRecorder();
      await liveScoringController.updateScore(scoreRequest({ actionId, expectedVersion: 0 }), firstResponse);
      assert.equal(firstResponse.statusCode, 200);
      assert.equal(firstResponse.body.success, true);
      assert.equal(firstResponse.body.duplicate, false);
      assert.equal(firstResponse.body.match.innings1.runs, 1);
      assert.equal(firstResponse.body.match.stateVersion, 1);
      assert.equal(match.saveCount, 1);
      assert.equal(match.innings1.events.filter((event) => event.type === "BALL").length, 1);

      const retryResponse = responseRecorder();
      await liveScoringController.updateScore(scoreRequest({ actionId, expectedVersion: 0 }), retryResponse);
      assert.equal(retryResponse.statusCode, 200);
      assert.equal(retryResponse.body.duplicate, true);
      assert.equal(retryResponse.body.match.innings1.runs, 1);
      assert.equal(match.saveCount, 1);
      assert.equal(match.innings1.events.filter((event) => event.type === "BALL").length, 1);

      const payloadMismatchResponse = responseRecorder();
      await liveScoringController.updateScore(scoreRequest({
        actionId,
        expectedVersion: 1,
        runs: 2,
      }), payloadMismatchResponse);
      assert.equal(payloadMismatchResponse.statusCode, 409);
      assert.equal(payloadMismatchResponse.body.code, "ACTION_ID_PAYLOAD_MISMATCH");
      assert.equal(match.innings1.runs, 1);
      assert.equal(match.saveCount, 1);

      const reusedResponse = responseRecorder();
      await liveScoringController.undoLastAction(request({
        headers: { "Idempotency-Key": actionId, "If-Match-Version": 1 },
      }), reusedResponse);
      assert.equal(reusedResponse.statusCode, 409);
      assert.equal(reusedResponse.body.code, "ACTION_ID_REUSED");
      assert.equal(match.innings1.runs, 1);

      const staleResponse = responseRecorder();
      await liveScoringController.updateScore(scoreRequest({
        actionId: "score-action-0002",
        expectedVersion: 0,
      }), staleResponse);
      assert.equal(staleResponse.statusCode, 409);
      assert.equal(staleResponse.body.code, "STALE_MATCH_VERSION");
      assert.equal(match.innings1.events.filter((event) => event.type === "BALL").length, 1);
    });
  });

  test("squad-backed matches allow adjustments and non-delivery dismissals without a bowler", async () => {
    const squads = {
      squadA: ["Team A Batter 1", "Team A Batter 2"],
      squadB: ["Team B Bowler 1"],
    };

    for (const extraType of ["bonus", "penalty"]) {
      const adjustmentMatch = makeLiveDocument(squads);
      await withFindById(async () => adjustmentMatch, async () => {
        const adjustmentResponse = responseRecorder();
        await liveScoringController.updateScore(request({
          headers: {
            "Idempotency-Key": `${extraType}-adjustment-0001`,
            "If-Match-Version": 0,
          },
          body: {
            inningsNum: 1,
            runs: 5,
            extraType,
          },
        }), adjustmentResponse);

        assert.equal(adjustmentResponse.statusCode, 200);
        assert.equal(adjustmentResponse.body.match.innings1.runs, 5);
        assert.equal(adjustmentResponse.body.match.innings1.extras, 5);
        assert.equal(adjustmentResponse.body.match.innings1.balls, 0);
      });
    }

    const dismissalMatch = makeLiveDocument(squads);
    await withFindById(async () => dismissalMatch, async () => {
      const dismissalResponse = responseRecorder();
      await liveScoringController.updateScore(request({
        headers: {
          "Idempotency-Key": "timed-out-action-0001",
          "If-Match-Version": 0,
        },
        body: {
          inningsNum: 1,
          batterName: "Team A Batter 1",
          outPlayerName: "Team A Batter 2",
          runs: 0,
          isWicket: true,
          wicketType: "timedOut",
        },
      }), dismissalResponse);

      assert.equal(dismissalResponse.statusCode, 200);
      assert.equal(dismissalResponse.body.match.innings1.wickets, 1);
      assert.equal(dismissalResponse.body.match.innings1.balls, 0);
      assert.equal(
        dismissalResponse.body.match.innings1.batsmen.find((batter) => batter.name === "Team A Batter 2").isOut,
        true,
      );
    });

    for (const invalidRequest of [
      {
        actionId: "invalid-adjustment-player-0001",
        body: {
          inningsNum: 1,
          runs: 5,
          extraType: "bonus",
          batterName: "Outside Batter",
        },
        expectedCode: "INVALID_BATTER",
      },
      {
        actionId: "invalid-retirement-bowler-0001",
        body: {
          inningsNum: 1,
          batterName: "Team A Batter 1",
          bowlerName: "Outside Bowler",
          outPlayerName: "Team A Batter 2",
          runs: 0,
          isWicket: true,
          wicketType: "retiredOut",
        },
        expectedCode: "INVALID_BOWLER",
      },
    ]) {
      const invalidMatch = makeLiveDocument(squads);
      await withFindById(async () => invalidMatch, async () => {
        const invalidResponse = responseRecorder();
        await liveScoringController.updateScore(request({
          headers: {
            "Idempotency-Key": invalidRequest.actionId,
            "If-Match-Version": 0,
          },
          body: invalidRequest.body,
        }), invalidResponse);

        assert.equal(invalidResponse.statusCode, 422);
        assert.equal(invalidResponse.body.code, invalidRequest.expectedCode);
        assert.equal(invalidMatch.saveCount, 0);
      });
    }
  });

  test("undoing and redoing a winning ball transitions completed -> live -> completed atomically", async () => {
    const first = new EventHistory({ battingTeam: "Team A", bowlingTeam: "Team B", inningsNumber: 1 });
    first.ball({ batsmanRuns: 5 });
    first.end();
    const second = new EventHistory({
      battingTeam: "Team B",
      bowlingTeam: "Team A",
      inningsNumber: 2,
      startSequence: first.sequence,
    });
    second.ball({ batsmanRuns: 1 });
    second.ball({ batsmanRuns: 5 });
    const match = makeDocument({
      currentInnings: 2,
      innings1: first.project(),
      innings2: second.project({ target: 6 }),
      eventSequence: second.sequence,
      __v: 4,
    });
    liveScoringController._test.synchronizeMatch(match);
    assert.equal(match.status, "completed");
    assert.equal(match.result, "Team B won by 10 wickets");

    await withFindById(async () => match, async () => {
      const undoRequest = request({
        headers: { "Idempotency-Key": "undo-winning-0001", "If-Match-Version": 4 },
      });
      const undoResponse = responseRecorder();
      await liveScoringController.undoLastAction(undoRequest, undoResponse);

      assert.equal(undoResponse.statusCode, 200);
      assert.equal(undoResponse.body.match.status, "live");
      assert.equal(undoResponse.body.match.phase, "secondInnings");
      assert.equal(undoResponse.body.match.result, "");
      assert.equal(undoResponse.body.match.requiredRuns, 5);
      assert.equal(undoResponse.body.match.innings1.runs, 5);
      assert.equal(undoResponse.body.match.innings2.runs, 1);
      assert.equal(match.redoStack.length, 1);
      assert.equal(match.saveCount, 1);

      const duplicateUndoResponse = responseRecorder();
      await liveScoringController.undoLastAction(undoRequest, duplicateUndoResponse);
      assert.equal(duplicateUndoResponse.statusCode, 200);
      assert.equal(duplicateUndoResponse.body.duplicate, true);
      assert.equal(duplicateUndoResponse.body.match.innings2.runs, 1);
      assert.equal(match.redoStack.length, 1);
      assert.equal(match.saveCount, 1);

      const redoRequest = request({
        headers: { "Idempotency-Key": "redo-winning-0001", "If-Match-Version": 5 },
      });
      const redoResponse = responseRecorder();
      await liveScoringController.redoLastAction(redoRequest, redoResponse);
      assert.equal(redoResponse.statusCode, 200);
      assert.equal(redoResponse.body.match.status, "completed");
      assert.equal(redoResponse.body.match.result, "Team B won by 10 wickets");
      assert.equal(redoResponse.body.match.innings1.runs, 5);
      assert.equal(redoResponse.body.match.innings2.runs, 6);
      assert.equal(match.redoStack.length, 0);
      assert.equal(match.saveCount, 2);
    });
  });

  test("repeated Undo removes every fresh event and then returns a controlled empty-history conflict", async () => {
    const match = makeLiveDocument();
    assert.equal(match.innings1.events.length, 3);

    await withFindById(async () => match, async () => {
      for (let index = 0; index < 3; index += 1) {
        const response = responseRecorder();
        await liveScoringController.undoLastAction(request({
          headers: {
            "Idempotency-Key": `undo-to-start-${String(index + 1).padStart(4, "0")}`,
            "If-Match-Version": index,
          },
        }), response);
        assert.equal(response.statusCode, 200);
      }

      assert.deepEqual(match.innings1.events, []);
      assert.deepEqual(match.innings1.batsmen, []);
      assert.deepEqual(match.innings1.bowlers, []);
      assert.equal(match.innings1.runs, 0);
      assert.equal(match.innings1.wickets, 0);
      assert.equal(match.innings1.balls, 0);

      const emptyResponse = responseRecorder();
      await liveScoringController.undoLastAction(request({
        headers: {
          "Idempotency-Key": "undo-empty-history-0001",
          "If-Match-Version": 3,
        },
      }), emptyResponse);
      assert.equal(emptyResponse.statusCode, 409);
      assert.equal(emptyResponse.body.code, "NOTHING_TO_UNDO");
    });
  });

  test("a VersionError becomes a 409 conflict when another action won the save race", async () => {
    const versionError = Object.assign(new Error("version conflict"), { name: "VersionError" });
    const losingDocument = makeLiveDocument({}, async () => { throw versionError; });
    const latestDocument = makeLiveDocument({ __v: 1 });
    let lookup = 0;

    await withFindById(async () => {
      lookup += 1;
      return lookup === 1 ? losingDocument : latestDocument;
    }, async () => {
      const response = responseRecorder();
      await liveScoringController.updateScore(scoreRequest({
        actionId: "racing-score-0001",
        expectedVersion: 0,
      }), response);

      assert.equal(response.statusCode, 409);
      assert.equal(response.body.code, "SCORING_CONFLICT");
      assert.equal(latestDocument.innings1.runs, 0);
      assert.equal(lookup, 2);
    });
  });

  test("a VersionError retry returns the winner when the same action was already committed", async () => {
    const actionId = "racing-score-0002";
    const versionError = Object.assign(new Error("version conflict"), { name: "VersionError" });
    const losingDocument = makeLiveDocument({}, async () => { throw versionError; });
    const committedHistory = new EventHistory({ battingTeam: "Team A", bowlingTeam: "Team B", inningsNumber: 1 });
    committedHistory.ball({ batsmanRuns: 1 });
    const committedDocument = makeDocument({
      innings1: committedHistory.project(),
      eventSequence: committedHistory.sequence,
      __v: 1,
      processedActions: [{ actionId, operation: "SCORE_BALL", eventSequence: committedHistory.sequence }],
    });
    let lookup = 0;

    await withFindById(async () => {
      lookup += 1;
      return lookup === 1 ? losingDocument : committedDocument;
    }, async () => {
      const response = responseRecorder();
      await liveScoringController.updateScore(scoreRequest({ actionId, expectedVersion: 0 }), response);

      assert.equal(response.statusCode, 200);
      assert.equal(response.body.duplicate, true);
      assert.equal(response.body.match.innings1.runs, 1);
      assert.equal(response.body.match.stateVersion, 1);
      assert.equal(lookup, 2);
    });
  });

  test("a same-key save race rejects a winner that committed a different payload", async () => {
    const actionId = "racing-payload-0001";
    const committedDocument = makeLiveDocument();
    await withFindById(async () => committedDocument, async () => {
      const committedResponse = responseRecorder();
      await liveScoringController.updateScore(scoreRequest({
        actionId,
        expectedVersion: 0,
        runs: 2,
      }), committedResponse);
      assert.equal(committedResponse.statusCode, 200);
      assert.equal(committedDocument.innings1.runs, 2);
    });

    const versionError = Object.assign(new Error("version conflict"), { name: "VersionError" });
    const losingDocument = makeLiveDocument({}, async () => { throw versionError; });
    let lookup = 0;
    await withFindById(async () => {
      lookup += 1;
      return lookup === 1 ? losingDocument : committedDocument;
    }, async () => {
      const response = responseRecorder();
      await liveScoringController.updateScore(scoreRequest({
        actionId,
        expectedVersion: 0,
        runs: 1,
      }), response);

      assert.equal(response.statusCode, 409);
      assert.equal(response.body.code, "ACTION_ID_PAYLOAD_MISMATCH");
      assert.equal(committedDocument.innings1.runs, 2);
      assert.equal(lookup, 2);
    });
  });

  test("two truly concurrent score requests from one version commit exactly one event", async () => {
    let stored = makeLiveDocument();
    let arrivals = 0;
    let releaseFirstSave;

    const makeSnapshot = () => {
      const snapshotVersion = stored.__v;
      return makeLiveDocument(persistedFields(stored), async function compareAndSwapSave() {
        arrivals += 1;
        if (arrivals === 1) {
          await new Promise((resolve) => { releaseFirstSave = resolve; });
        } else {
          releaseFirstSave();
        }

        if (stored.__v !== snapshotVersion) {
          throw Object.assign(new Error("version conflict"), { name: "VersionError" });
        }
        this.__v = snapshotVersion + 1;
        stored = makeLiveDocument(persistedFields(this));
        return this;
      });
    };

    let initialReads = 0;
    await withFindById(async () => {
      if (initialReads < 2) {
        initialReads += 1;
        return makeSnapshot();
      }
      return stored;
    }, async () => {
      const firstResponse = responseRecorder();
      const secondResponse = responseRecorder();
      await Promise.all([
        liveScoringController.updateScore(scoreRequest({
          actionId: "parallel-score-0001",
          expectedVersion: 0,
        }), firstResponse),
        liveScoringController.updateScore(scoreRequest({
          actionId: "parallel-score-0002",
          expectedVersion: 0,
        }), secondResponse),
      ]);

      assert.deepEqual([firstResponse.statusCode, secondResponse.statusCode].sort(), [200, 409]);
      assert.equal(stored.__v, 1);
      assert.equal(stored.innings1.runs, 1);
      assert.equal(stored.innings1.events.filter((event) => event.type === "BALL").length, 1);
      assert.equal(stored.processedActions.length, 1);
    });
  });

  test("rapid concurrent retries with one actionId return one commit and one duplicate", async () => {
    let stored = makeLiveDocument();
    let arrivals = 0;
    let releaseFirstSave;

    const makeSnapshot = () => {
      const snapshotVersion = stored.__v;
      return makeLiveDocument(persistedFields(stored), async function compareAndSwapSave() {
        arrivals += 1;
        if (arrivals === 1) {
          await new Promise((resolve) => { releaseFirstSave = resolve; });
        } else {
          releaseFirstSave();
        }

        if (stored.__v !== snapshotVersion) {
          throw Object.assign(new Error("version conflict"), { name: "VersionError" });
        }
        this.__v = snapshotVersion + 1;
        stored = makeLiveDocument(persistedFields(this));
        return this;
      });
    };

    let initialReads = 0;
    await withFindById(async () => {
      if (initialReads < 2) {
        initialReads += 1;
        return makeSnapshot();
      }
      return stored;
    }, async () => {
      const firstResponse = responseRecorder();
      const secondResponse = responseRecorder();
      const retry = scoreRequest({ actionId: "parallel-retry-0001", expectedVersion: 0 });
      await Promise.all([
        liveScoringController.updateScore(retry, firstResponse),
        liveScoringController.updateScore(scoreRequest({
          actionId: "parallel-retry-0001",
          expectedVersion: 0,
        }), secondResponse),
      ]);

      assert.deepEqual([firstResponse.statusCode, secondResponse.statusCode], [200, 200]);
      assert.deepEqual([firstResponse.body.duplicate, secondResponse.body.duplicate].sort(), [false, true]);
      assert.equal(stored.innings1.runs, 1);
      assert.equal(stored.innings1.events.filter((event) => event.type === "BALL").length, 1);
      assert.equal(stored.processedActions.length, 1);
    });
  });

  test("persisted action receipts make a post-restart network retry idempotent", async () => {
    const actionId = "restart-retry-0001";
    let original = makeLiveDocument();

    await withFindById(async () => original, async () => {
      const response = responseRecorder();
      await liveScoringController.updateScore(scoreRequest({ actionId, expectedVersion: 0 }), response);
      assert.equal(response.statusCode, 200);
      assert.equal(response.body.duplicate, false);
    });

    const restartedDocument = makeLiveDocument(persistedFields(original));
    await withFindById(async () => restartedDocument, async () => {
      const response = responseRecorder();
      await liveScoringController.updateScore(scoreRequest({ actionId, expectedVersion: 0 }), response);

      assert.equal(response.statusCode, 200);
      assert.equal(response.body.duplicate, true);
      assert.equal(response.body.match.innings1.runs, 1);
      assert.equal(restartedDocument.saveCount, 1, "the persisted saveCount is unchanged by the retry");
      assert.equal(restartedDocument.innings1.events.filter((event) => event.type === "BALL").length, 1);
    });
  });

  test("synchronization creates exactly one independent second innings and removes an unused one after undo", () => {
    const first = new EventHistory({ battingTeam: "Team A", bowlingTeam: "Team B", inningsNumber: 1 });
    first.ball({ batsmanRuns: 4 });
    first.end();
    const match = makeDocument({ innings1: first.project(), innings2: undefined, eventSequence: first.sequence });

    liveScoringController._test.synchronizeMatch(match);
    const initializedSecond = match.innings2;
    assert.ok(initializedSecond);
    assert.equal(initializedSecond.battingTeam, "Team B");
    assert.equal(initializedSecond.runs, 0);
    assert.equal(match.innings1.runs, 4);
    assert.notStrictEqual(match.innings1, initializedSecond);

    liveScoringController._test.synchronizeMatch(match);
    assert.equal(match.innings2.battingTeam, "Team B");
    assert.equal(match.innings2.runs, 0);
    assert.deepEqual(match.innings2.events, []);

    match.innings1.events.pop();
    liveScoringController._test.synchronizeMatch(match);
    assert.equal(match.currentInnings, 1);
    assert.equal(match.status, "live");
    assert.equal(match.innings1.runs, 4);
    assert.equal(match.innings2, undefined);
  });

  test("legacy first-innings closure is preserved while an existing chase remains innings two", () => {
    const match = makeDocument({
      status: "live",
      phase: "secondInnings",
      currentInnings: 2,
      eventSequence: 0,
      innings1: {
        battingTeam: "Team A",
        bowlingTeam: "Team B",
        runs: 25,
        wickets: 2,
        balls: 11,
        extras: 0,
        batsmen: [
          { name: "Team A Batter 1", runs: 20, balls: 7, isActive: true, isStriker: true },
          { name: "Team A Batter 2", runs: 5, balls: 4, isActive: true, isStriker: false },
        ],
        bowlers: [{ name: "Team B Bowler 1", balls: 11, runs: 25 }],
        events: [],
      },
      innings2: {
        battingTeam: "Team B",
        bowlingTeam: "Team A",
        runs: 3,
        wickets: 0,
        balls: 1,
        extras: 0,
        batsmen: [
          { name: "Team B Batter 1", runs: 3, balls: 1, isActive: true, isStriker: false },
          { name: "Team B Batter 2", runs: 0, balls: 0, isActive: true, isStriker: true },
        ],
        bowlers: [{ name: "Team A Bowler 1", balls: 1, runs: 3 }],
        events: [],
      },
    });

    liveScoringController._test.synchronizeMatch(match);

    assert.equal(match.innings1.runs, 25);
    assert.equal(match.innings1.isDone, true);
    assert.equal(match.innings1.endReason, "legacyClosed");
    assert.equal(match.innings1.historyBase.isDone, true);
    assert.equal(match.innings2.runs, 3);
    assert.equal(match.currentInnings, 2);
    assert.equal(match.target, 26);
    assert.equal(match.requiredRuns, 23);
    assert.equal(match.phase, "secondInnings");
  });

  test("End Match is idempotent and cannot replace an existing final result", async () => {
    const first = new EventHistory({ battingTeam: "Team A", bowlingTeam: "Team B", inningsNumber: 1 });
    first.ball({ batsmanRuns: 5 });
    first.end();
    const second = new EventHistory({
      battingTeam: "Team B",
      bowlingTeam: "Team A",
      inningsNumber: 2,
      startSequence: first.sequence,
    });
    second.ball({ batsmanRuns: 5 });
    second.end();
    const match = makeDocument({
      currentInnings: 2,
      innings1: first.project(),
      innings2: second.project({ target: 6 }),
      eventSequence: second.sequence,
      __v: 0,
    });
    liveScoringController._test.synchronizeMatch(match);
    assert.equal(match.status, "completed");
    assert.equal(match.result, "Match tied");

    await withFindById(async () => match, async () => {
      const conflictingResponse = responseRecorder();
      await liveScoringController.setMatchStatus(request({
        headers: { "Idempotency-Key": "end-as-no-result-0001", "If-Match-Version": 0 },
        body: { status: "completed", noResult: true },
      }), conflictingResponse);
      assert.equal(conflictingResponse.statusCode, 409);
      assert.equal(conflictingResponse.body.code, "MATCH_ALREADY_FINALIZED");
      assert.equal(match.result, "Match tied");
      assert.equal(match.saveCount, 0);

      const idempotentResponse = responseRecorder();
      await liveScoringController.setMatchStatus(request({
        headers: { "Idempotency-Key": "end-match-repeat-0001", "If-Match-Version": 0 },
        body: { status: "completed", result: "Match tied" },
      }), idempotentResponse);
      assert.equal(idempotentResponse.statusCode, 200);
      assert.equal(idempotentResponse.body.idempotent, true);
      assert.equal(idempotentResponse.body.match.result, "Match tied");
      assert.equal(match.saveCount, 0);
    });
  });

  test("starting a super over clears regulation-derived display state immediately", async () => {
    const first = new EventHistory({ battingTeam: "Team A", bowlingTeam: "Team B", inningsNumber: 1 });
    first.ball({ batsmanRuns: 5 });
    first.end();
    const second = new EventHistory({
      battingTeam: "Team B",
      bowlingTeam: "Team A",
      inningsNumber: 2,
      startSequence: first.sequence,
    });
    second.ball({ batsmanRuns: 5 });
    second.end();
    const match = makeDocument({
      currentInnings: 2,
      innings1: first.project(),
      innings2: second.project({ target: 6 }),
      eventSequence: second.sequence,
      __v: 0,
    });
    liveScoringController._test.synchronizeMatch(match);
    assert.equal(match.status, "completed");
    assert.equal(match.result, "Match tied");
    assert.equal(match.target, 6);
    assert.deepEqual(match.recentBalls, ["5"]);

    await withFindById(async () => match, async () => {
      const response = responseRecorder();
      await liveScoringController.startSuperOver(request({
        headers: {
          "Idempotency-Key": "start-super-over-0001",
          "If-Match-Version": 0,
        },
      }), response);

      assert.equal(response.statusCode, 200);
      assert.equal(response.body.match.isSuperOver, true);
      assert.equal(response.body.match.status, "live");
      assert.equal(response.body.match.currentInnings, 1);
      assert.equal(response.body.match.target, 0);
      assert.equal(response.body.match.requiredRuns, 0);
      assert.equal(response.body.match.requiredRunRate, 0);
      assert.deepEqual(response.body.match.recentBalls, []);
      assert.deepEqual(response.body.match.currentBatsmen, []);
      assert.equal(response.body.match.currentBowler, "");
      assert.equal(response.body.match.superOverInnings1.battingTeam, "Team B");
    });
  });

  test("aggregate rebuild failures are isolated so player stats still refresh", async () => {
    await liveScoringController._test.waitForDerivedRebuilds();
    const matchController = require("../controllers/matchController");
    const originalPointsRebuild = matchController.rebuildPointsTable;
    const currentPlayerRebuild = playerController.rebuildAllPlayerStats;
    const originalConsoleError = console.error;
    let playerRebuilds = 0;
    try {
      matchController.rebuildPointsTable = async () => { throw new Error("expected points failure"); };
      playerController.rebuildAllPlayerStats = async () => { playerRebuilds += 1; };
      console.error = () => {};
      liveScoringController._test.scheduleDerivedRebuilds({ tournament: "tournament-1" }, { refreshAggregates: true });
      await liveScoringController._test.waitForDerivedRebuilds();
      assert.equal(playerRebuilds, 1);
    } finally {
      matchController.rebuildPointsTable = originalPointsRebuild;
      playerController.rebuildAllPlayerStats = currentPlayerRebuild;
      console.error = originalConsoleError;
    }
  });
});
