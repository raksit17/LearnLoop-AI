const { test } = require("node:test");
const assert = require("node:assert/strict");
const { matchesPublicOrigin, localDemoEnabled } = require("../dist/local");

test("local origins can use localhost or 127.0.0.1 with the same port", () => {
  assert.equal(matchesPublicOrigin("http://127.0.0.1:4318", "http://localhost:4318"), true);
  assert.equal(matchesPublicOrigin("http://localhost:4318", "http://127.0.0.1:4318"), true);
  assert.equal(matchesPublicOrigin("http://127.0.0.1:4319", "http://localhost:4318"), false);
  assert.equal(matchesPublicOrigin("http://evil.example", "http://localhost:4318"), false);
  assert.equal(matchesPublicOrigin("https://localhost:4318", "http://localhost:4318"), false);
  assert.equal(matchesPublicOrigin("https://app.example", "https://app.example"), true);
});

test("demo bypass is explicit and strictly limited to loopback HTTP URLs", () => {
  assert.equal(localDemoEnabled("true", "http://localhost:4318"), true);
  assert.equal(localDemoEnabled("true", "http://127.0.0.1:4318"), true);
  assert.equal(localDemoEnabled("false", "http://localhost:4318"), false);
  assert.equal(localDemoEnabled(undefined, "http://localhost:4318"), false);
  assert.equal(localDemoEnabled("true", "https://app.example"), false);
  assert.equal(localDemoEnabled("true", "http://192.168.1.10:4318"), false);
  assert.equal(localDemoEnabled("true", "http://localhost.evil.example:4318"), false);
  assert.equal(localDemoEnabled("true", "http://localhost:4318/some/path"), false);
});
