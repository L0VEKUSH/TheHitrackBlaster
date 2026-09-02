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

const NON_DELIVERY_WICKET_TYPES = Object.freeze([
  "retiredHurt",
  "retiredOut",
  "timedOut",
]);

const NON_DELIVERY_WICKET_TYPE_SET = new Set(NON_DELIVERY_WICKET_TYPES);

const WICKET_TYPES_BY_EXTRA = Object.freeze({
  noBall: Object.freeze(["runOut", "obstructingField", "hitBallTwice"]),
  wide: Object.freeze(["runOut", "stumped", "hitWicket", "obstructingField"]),
  bye: Object.freeze(["runOut", "obstructingField", "hitBallTwice"]),
  legBye: Object.freeze(["runOut", "obstructingField", "hitBallTwice"]),
});

export const isNonDeliveryWicketType = (wicketType) => (
  NON_DELIVERY_WICKET_TYPE_SET.has(wicketType)
);

export const getWicketTypesForExtra = (extraType, { freeHitPending = false } = {}) => {
  const wicketTypes = WICKET_TYPES_BY_EXTRA[extraType] || DEFAULT_WICKET_TYPES;
  if (!freeHitPending) return wicketTypes;

  // A free hit protects the next delivery. Administrative dismissals are not
  // deliveries and therefore remain available, but they cannot be combined
  // with an extra selected for the pending ball.
  if (extraType) return [];
  return wicketTypes.filter(isNonDeliveryWicketType);
};
