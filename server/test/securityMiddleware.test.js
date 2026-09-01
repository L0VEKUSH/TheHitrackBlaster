const test = require("node:test");
const assert = require("node:assert/strict");
const { sanitizeInput, validatePayloadSize } = require("../middleware/validation");

const responseRecorder = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  }
});

test("sanitizeInput trims display text but preserves credential whitespace", () => {
  const req = {
    body: { name: "  Batter One  ", password: "  exact secret  " },
    query: {},
    params: {}
  };
  const res = responseRecorder();
  let nextCalled = false;

  sanitizeInput(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(req.body.name, "Batter One");
  assert.equal(req.body.password, "  exact secret  ");
});

test("sanitizeInput rejects prototype-pollution keys", () => {
  const req = {
    body: JSON.parse('{"constructor":{"prototype":{"admin":true}}}'),
    query: {},
    params: {}
  };
  const res = responseRecorder();

  sanitizeInput(req, res, () => assert.fail("unsafe payload reached next middleware"));

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /Unsafe object key/);
  assert.equal({}.admin, undefined);
});

test("sanitizeInput rejects excessive nesting and string length", () => {
  let nested = "value";
  for (let index = 0; index < 14; index += 1) nested = { child: nested };
  const nestedReq = { body: nested, query: {}, params: {} };
  const nestedRes = responseRecorder();
  sanitizeInput(nestedReq, nestedRes, () => assert.fail("deep payload reached next middleware"));
  assert.equal(nestedRes.statusCode, 400);

  const longReq = { body: { name: "x".repeat(10001) }, query: {}, params: {} };
  const longRes = responseRecorder();
  sanitizeInput(longReq, longRes, () => assert.fail("long string reached next middleware"));
  assert.equal(longRes.statusCode, 400);
});

test("validatePayloadSize enforces the normal one MiB limit", () => {
  const req = { path: "/api/matches/123", headers: { "content-length": String(1024 * 1024 + 1) } };
  const res = responseRecorder();
  validatePayloadSize(req, res, () => assert.fail("oversize payload reached parser"));
  assert.equal(res.statusCode, 413);
});

test("validatePayloadSize allows multipart overhead only on the real upload route", () => {
  const req = { path: "/api/upload/image", headers: { "content-length": String(5.5 * 1024 * 1024) } };
  const res = responseRecorder();
  let nextCalled = false;
  validatePayloadSize(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);

  const tooLargeReq = { path: "/api/upload/image", headers: { "content-length": String(6 * 1024 * 1024 + 1) } };
  const tooLargeRes = responseRecorder();
  validatePayloadSize(tooLargeReq, tooLargeRes, () => assert.fail("oversize upload reached Multer"));
  assert.equal(tooLargeRes.statusCode, 413);
});
