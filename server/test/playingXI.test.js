"use strict";

const assert = require("node:assert/strict");
const { describe, test } = require("node:test");

const Match = require("../models/Match");
const Player = require("../models/Player");
const matchController = require("../controllers/matchController");
const matchRoutes = require("../routes/matchRoutes");
const {
  rankFuzzyCandidates,
  resolveParticipantEntries,
} = require("../utils/playingXIResolver");
const {
  guardedApplySide,
  normalizeLegacySquad,
  parseArguments,
  planMatchBackfill,
} = require("../scripts/migratePlayingXI");

const MATCH_ID = "507f1f77bcf86cd799439000";
const IDS = {
  alexA: "507f1f77bcf86cd799439001",
  alexB: "507f1f77bcf86cd799439002",
  beth: "507f1f77bcf86cd799439003",
  cara: "507f1f77bcf86cd799439004",
  drew: "507f1f77bcf86cd799439005",
};

const players = [
  { _id: IDS.alexA, name: "Alex Stone", fullName: "Alex Stone", team: "Team A" },
  { _id: IDS.alexB, name: "Alex Stone", fullName: "Alexander Stone", team: "Team B" },
  { _id: IDS.beth, name: "Beth Ray", fullName: "Beth Ray", team: "Team A" },
  { _id: IDS.cara, name: "Cara Moss", fullName: "Cara Moss", team: "Team B" },
  { _id: IDS.drew, name: "Drew Lake", fullName: "Drew Lake", team: "Team B" },
];

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

const makeMatch = (fields = {}) => {
  const match = {
    _id: MATCH_ID,
    teamA: "Team A",
    teamB: "Team B",
    status: "upcoming",
    phase: "upcoming",
    statistics: {},
    __v: 0,
    saveCount: 0,
    ...fields,
    async save() {
      this.saveCount += 1;
      this.__v += 1;
      return this;
    },
    toObject() {
      const plain = {};
      for (const [key, value] of Object.entries(this)) {
        if (typeof value !== "function") plain[key] = value;
      }
      return JSON.parse(JSON.stringify(plain));
    },
  };
  return match;
};

const withControllerModels = async ({ match, playerRecords = players }, work) => {
  const originalMatchFindById = Match.findById;
  const originalPlayerFind = Player.find;
  Match.findById = async () => match;
  Player.find = () => ({
    select() { return this; },
    async lean() { return playerRecords; },
  });
  try {
    return await work();
  } finally {
    Match.findById = originalMatchFindById;
    Player.find = originalPlayerFind;
  }
};

const request = (body, id = MATCH_ID) => ({ params: { id }, body });

describe("Playing XI resolution helpers", () => {
  test("direct participant objects require IDs and snapshots come from Player", () => {
    const resolved = resolveParticipantEntries({
      entries: [
        { playerId: IDS.beth, nameSnapshot: "Untrusted Name" },
        { nameSnapshot: "Cara Moss" },
      ],
      players,
      side: "teamAPlayingXI",
      list: "playingXI",
    });

    assert.deepEqual(resolved.participants, [{ playerId: IDS.beth, nameSnapshot: "Beth Ray" }]);
    assert.equal(resolved.validationIssues[0].code, "PLAYER_ID_REQUIRED");
  });

  test("legacy names resolve only on a unique exact match", () => {
    const resolved = resolveParticipantEntries({
      entries: ["Beth Ray", "Alex Stone", "Alex Ston"],
      players,
      side: "teamAPlayingXI",
      list: "playingXI",
    });

    assert.deepEqual(resolved.participants, [{ playerId: IDS.beth, nameSnapshot: "Beth Ray" }]);
    assert.deepEqual(resolved.resolutionIssues.map((issue) => issue.code), [
      "AMBIGUOUS_PLAYER_NAME",
      "PLAYER_NAME_NOT_FOUND",
    ]);
    assert.equal(resolved.resolutionIssues[0].candidates[0].score, 1);
    assert.equal(resolved.resolutionIssues[1].candidates[0].nameSnapshot, "Alex Stone");
  });

  test("fuzzy candidates are ranked but never selected", () => {
    const ranked = rankFuzzyCandidates("Bth Ray", players);
    assert.equal(ranked[0].playerId, IDS.beth);
    assert.ok(ranked[0].score > ranked[1].score);
  });
});

describe("PUT /matches/:id/playing-xi controller", { concurrency: false }, () => {
  test("route is registered as an authenticated locked PUT mutation", () => {
    const layer = matchRoutes.stack.find((candidate) => candidate.route?.path === "/:id/playing-xi");
    assert.ok(layer, "expected Playing XI route to be registered");
    assert.equal(layer.route.methods.put, true);
    assert.equal(layer.route.stack.length, 3);
  });

  test("updates both teams atomically and derives trusted snapshots", async () => {
    const match = makeMatch();
    await withControllerModels({ match }, async () => {
      const response = responseRecorder();
      await matchController.updatePlayingXI(request({
        teamAPlayingXI: {
          playingXI: [{ playerId: IDS.alexA }, { playerId: IDS.beth, nameSnapshot: "Wrong" }],
          substitutes: [],
          captainId: IDS.alexA,
          wicketKeeperId: IDS.beth,
        },
        teamBPlayingXI: {
          playingXI: [{ playerId: IDS.cara }, { playerId: IDS.drew }],
          substitutes: [],
          captainId: IDS.cara,
        },
      }), response);

      assert.equal(response.statusCode, 200);
      assert.equal(response.body.success, true);
      assert.equal(match.saveCount, 1);
      assert.deepEqual(match.teamAPlayingXI.playingXI, [
        { playerId: IDS.alexA, nameSnapshot: "Alex Stone" },
        { playerId: IDS.beth, nameSnapshot: "Beth Ray" },
      ]);
      assert.deepEqual(match.teamAParticipants, match.teamAPlayingXI.playingXI);
      assert.deepEqual(match.teamBParticipants, match.teamBPlayingXI.playingXI);
      assert.equal(match.teamAPlayingXI.captainName, "Alex Stone");
      assert.equal(match.teamAPlayingXI.wicketKeeperNameSnapshot, "Beth Ray");
      assert.ok(match.teamAPlayingXI.selectedAt instanceof Date);
      assert.equal(response.body.match.teamBPlayingXI.playingXI[1].nameSnapshot, "Drew Lake");
    });
  });

  test("preserves an omitted team roster", async () => {
    const existingB = {
      playingXI: [
        { playerId: IDS.cara, nameSnapshot: "Cara Moss" },
        { playerId: IDS.drew, nameSnapshot: "Drew Lake" },
      ],
      substitutes: [],
    };
    const match = makeMatch({ teamBPlayingXI: existingB });
    await withControllerModels({ match }, async () => {
      const response = responseRecorder();
      await matchController.updatePlayingXI(request({
        teamAPlayingXI: {
          playingXI: [{ playerId: IDS.alexA }, { playerId: IDS.beth }],
          substitutes: [],
        },
      }), response);

      assert.equal(response.statusCode, 200);
      assert.strictEqual(match.teamBPlayingXI, existingB);
    });
  });

  test("returns structured 409 issues for ambiguous and fuzzy-only legacy names", async () => {
    const match = makeMatch();
    await withControllerModels({ match }, async () => {
      const response = responseRecorder();
      await matchController.updatePlayingXI(request({
        teamAPlayingXI: {
          playingXI: ["Alex Stone", "Bth Ray"],
          substitutes: [],
        },
      }), response);

      assert.equal(response.statusCode, 409);
      assert.equal(response.body.code, "PLAYER_RESOLUTION_REQUIRED");
      assert.deepEqual(response.body.resolutionIssues.map((issue) => issue.code), [
        "AMBIGUOUS_PLAYER_NAME",
        "PLAYER_NAME_NOT_FOUND",
      ]);
      assert.equal(response.body.resolutionIssues[1].candidates[0].playerId, IDS.beth);
      assert.equal(match.saveCount, 0);
    });
  });

  test("rejects duplicates, substitute overlap, and roles outside the XI", async () => {
    const match = makeMatch();
    await withControllerModels({ match }, async () => {
      const response = responseRecorder();
      await matchController.updatePlayingXI(request({
        teamAPlayingXI: {
          playingXI: [{ playerId: IDS.alexA }, { playerId: IDS.alexA }],
          substitutes: [{ playerId: IDS.alexA }],
          captainId: IDS.beth,
        },
      }), response);

      assert.equal(response.statusCode, 400);
      const codes = response.body.validationIssues.map((issue) => issue.code);
      assert.ok(codes.includes("DUPLICATE_PLAYING_XI_PLAYER"));
      assert.ok(codes.includes("PLAYING_XI_SUBSTITUTE_OVERLAP"));
      assert.ok(codes.includes("CAPTAIN_NOT_IN_PLAYING_XI"));
      assert.equal(match.saveCount, 0);
    });
  });

  test("locks the roster as soon as scoring state exists", async () => {
    const match = makeMatch({ innings1: { battingTeam: "Team A" } });
    let playerReads = 0;
    await withControllerModels({ match }, async () => {
      const originalFind = Player.find;
      Player.find = () => {
        playerReads += 1;
        return originalFind();
      };
      const response = responseRecorder();
      await matchController.updatePlayingXI(request({ teamAPlayingXI: {} }), response);
      assert.equal(response.statusCode, 409);
      assert.equal(response.body.code, "PLAYING_XI_LOCKED");
      assert.equal(match.saveCount, 0);
    });
    assert.equal(playerReads, 0);
  });
});

describe("Playing XI legacy migration planning", { concurrency: false }, () => {
  test("normalizes legacy squads and plans exact unique IDs without mutating input", () => {
    const match = {
      _id: MATCH_ID,
      teamA: "Team A",
      teamB: "Team B",
      squadA: ["  Beth   Ray ", "Beth Ray", "Alex Stone"],
      squadB: ["Cara Moss", "Drew Lake"],
      teamAPlayingXI: null,
      teamBPlayingXI: null,
    };
    const normalized = normalizeLegacySquad(match.squadA);
    assert.deepEqual(normalized.names, ["Beth Ray", "Alex Stone"]);
    assert.deepEqual(normalized.duplicateNames, ["Beth Ray"]);

    const plan = planMatchBackfill(match, players);
    assert.equal(plan.sides.teamAPlayingXI.status, "unresolved", "ambiguous Alex must not auto-resolve");
    assert.equal(plan.sides.teamBPlayingXI.status, "planned");
    assert.deepEqual(plan.updates.teamBPlayingXI.playingXI, [
      { playerId: IDS.cara, nameSnapshot: "Cara Moss" },
      { playerId: IDS.drew, nameSnapshot: "Drew Lake" },
    ]);
    assert.equal(match.teamBPlayingXI, null);
  });

  test("never plans over an existing roster and skips an unsafe wicket limit", () => {
    const existingA = { playingXI: [{ playerId: IDS.alexA, nameSnapshot: "Alex Stone" }] };
    const plan = planMatchBackfill({
      _id: MATCH_ID,
      teamA: "Team A",
      teamB: "Team B",
      squadA: ["Beth Ray", "Cara Moss"],
      squadB: ["Cara Moss", "Drew Lake"],
      teamAPlayingXI: existingA,
      teamBPlayingXI: null,
      innings1: { battingTeam: "Team B", wickets: 2 },
    }, players);

    assert.equal(plan.sides.teamAPlayingXI.code, "ALREADY_CONFIGURED");
    assert.equal(plan.sides.teamBPlayingXI.code, "UNSAFE_RECORDED_WICKET_COUNT");
    assert.deepEqual(plan.updates, {});
  });

  test("migration is dry-run by default and validates match arguments", () => {
    assert.deepEqual(parseArguments([]), { apply: false, matchId: null });
    assert.deepEqual(parseArguments(["--apply", "--match", MATCH_ID]), { apply: true, matchId: MATCH_ID });
    assert.throws(() => parseArguments(["--match"]), /requires/);
    assert.throws(() => parseArguments(["--match", "bad-id"]), /valid/);
  });

  test("apply helper guards against overwriting a concurrently configured side", async () => {
    const originalUpdateOne = Match.updateOne;
    let capturedFilter;
    Match.updateOne = async (filter) => {
      capturedFilter = filter;
      return { modifiedCount: 0 };
    };
    try {
      const result = await guardedApplySide(MATCH_ID, "teamAPlayingXI", { playingXI: [] });
      assert.equal(result.modifiedCount, 0);
      assert.equal(capturedFilter._id, MATCH_ID);
      assert.deepEqual(capturedFilter.$or, [
        { teamAPlayingXI: { $exists: false } },
        { teamAPlayingXI: null },
      ]);
    } finally {
      Match.updateOne = originalUpdateOne;
    }
  });
});
