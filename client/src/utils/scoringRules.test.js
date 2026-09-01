import assert from "node:assert/strict";
import test from "node:test";

import { getWicketTypesForExtra } from "./scoringRules.js";

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
