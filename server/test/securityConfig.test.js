const test = require("node:test");
const assert = require("node:assert/strict");
const { isPlaceholderSecret, validateProductionSecrets } = require("../utils/securityConfig");

test("production secret validation accepts independent strong values", () => {
  const errors = validateProductionSecrets({
    JWT_SECRET: "jwt-8vNw3Bq7sF2mK6tR9xP4cD1hL5zA0eYu",
    SETUP_SECRET: "setup-G7qL2wC9mX4vB8nK1rT6",
    ABOUT_ME_SECRET: "about-J4fP8sW2nR6xC9"
  });
  assert.deepEqual(errors, []);
});

test("optional feature secrets may be omitted but are validated when configured", () => {
  assert.deepEqual(validateProductionSecrets({
    JWT_SECRET: "jwt-8vNw3Bq7sF2mK6tR9xP4cD1hL5zA0eYu"
  }), []);

  const errors = validateProductionSecrets({
    JWT_SECRET: "jwt-8vNw3Bq7sF2mK6tR9xP4cD1hL5zA0eYu",
    SETUP_SECRET: "short",
    ABOUT_ME_SECRET: "replace-with-a-secret"
  });
  assert.ok(errors.some((error) => error.startsWith("SETUP_SECRET must contain")));
  assert.ok(errors.some((error) => error.startsWith("ABOUT_ME_SECRET must not")));
});

test("production secret validation rejects reused secrets", () => {
  const repeated = "independent-secret-that-is-long-enough-123";
  const errors = validateProductionSecrets({
    JWT_SECRET: repeated,
    SETUP_SECRET: repeated,
    ABOUT_ME_SECRET: repeated
  });
  assert.equal(errors.filter((error) => error.includes("must be different")).length, 3);
});

test("placeholder detection does not expose or accept template markers", () => {
  assert.equal(isPlaceholderSecret("replace-with-a-random-value"), true);
  assert.equal(isPlaceholderSecret("unique-U8qB2pL6vX9mK3"), false);
});
