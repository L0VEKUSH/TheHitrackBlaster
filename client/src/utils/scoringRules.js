const DEFAULT_WICKET_TYPES = Object.freeze([
  "bowled",
  "caught",
  "lbw",
  "stumped",
  "runOut",
  "hitWicket",
  "retiredHurt",
  "retiredOut",
  "timedOut",
  "obstructingField",
  "hitBallTwice",
]);

const WICKET_TYPES_BY_EXTRA = Object.freeze({
  noBall: Object.freeze(["runOut", "obstructingField", "hitBallTwice"]),
  wide: Object.freeze(["runOut", "stumped", "hitWicket", "obstructingField"]),
  bye: Object.freeze(["runOut", "obstructingField", "hitBallTwice"]),
  legBye: Object.freeze(["runOut", "obstructingField", "hitBallTwice"]),
});

export const getWicketTypesForExtra = (extraType) => (
  WICKET_TYPES_BY_EXTRA[extraType] || DEFAULT_WICKET_TYPES
);
