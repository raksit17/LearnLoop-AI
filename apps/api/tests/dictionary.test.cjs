const { test } = require("node:test");
const assert = require("node:assert/strict");
const { normalizeDictionaryKey, compareDictionaryAnswer } = require("../dist/dictionary-utils");
const { nextReview } = require("../dist/engine");

test("duplicate keys ignore case, whitespace and compatibility forms", () => {
  assert.equal(normalizeDictionaryKey("  DELIGHTED  "), "delighted");
  assert.equal(normalizeDictionaryKey("ＨＡＰＰＹ"), "happy");
  assert.equal(normalizeDictionaryKey("  very   happy "), "very happy");
  assert.equal(normalizeDictionaryKey(" ดีใจ  มาก "), "ดีใจ มาก");
});

test("synonym answer is distinct from the target answer", () => {
  assert.equal(compareDictionaryAnswer(" Glad ", "glad", ["happy"]), "exact");
  assert.equal(compareDictionaryAnswer("HAPPY", "glad", ["happy", "delighted"]), "synonym");
  assert.equal(compareDictionaryAnswer("sad", "glad", ["happy"]), "different");
  assert.equal(compareDictionaryAnswer("", "glad", ["happy"]), "different");
});

test("vocabulary review reuses the established spaced-repetition schedule", () => {
  assert.equal(nextReview(1, 14, 5, null, 0).dueAt.getTime(), 600000);
  assert.equal(nextReview(2, 14, 5, null, 0).days, 1);
  assert.equal(nextReview(3, 0, 5, null, 0).days, 3);
  assert.equal(nextReview(4, 0, 5, null, 0).days, 7);
});
