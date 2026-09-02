import assert from "node:assert/strict";
import test from "node:test";

import {
  getWicketTypesForExtra,
  isNonDeliveryWicketType,
} from "./scoringRules.js";

test("wicket choices match the server rules for delivery extras", () => {
  assert.deepEqual(
    getWicketTypesForExtra("noBall"),
    ["runOut", "obstructingField", "hitBallTwice"],
  );
  assert.deepEqual(
    getWicketTypesForExtra("wide"),
    ["runOut", "stumped", "hitWicket", "obstructingField"],
  );
  assert.deepEqual(
    getWicketTypesForExtra("bye"),
    ["runOut", "obstructingField", "hitBallTwice"],
  );
  assert.deepEqual(
    getWicketTypesForExtra("legBye"),
    ["runOut", "obstructingField", "hitBallTwice"],
  );
});

test("an ordinary delivery keeps the full dismissal list", () => {
  const wicketTypes = getWicketTypesForExtra("");

  assert.ok(wicketTypes.includes("caught"));
  assert.ok(wicketTypes.includes("runOut"));
  assert.ok(wicketTypes.includes("retiredHurt"));
});

test("a pending free hit exposes only non-delivery administrative dismissals", () => {
  assert.deepEqual(
    getWicketTypesForExtra("", { freeHitPending: true }),
    ["retiredHurt", "retiredOut", "timedOut"],
  );
  assert.equal(isNonDeliveryWicketType("retiredOut"), true);
  assert.equal(isNonDeliveryWicketType("runOut"), false);
});

test("a pending free hit offers no wicket action alongside a delivery extra", () => {
  for (const extraType of ["wide", "noBall", "bye", "legBye", "bonus", "penalty"]) {
    assert.deepEqual(
      getWicketTypesForExtra(extraType, { freeHitPending: true }),
      [],
    );
  }
});
