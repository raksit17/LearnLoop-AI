const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeQuestionPrompt,
  selectUniqueQuestions,
} = require("../dist/question-dedupe");

test("normalizes whitespace, casing, Unicode and ending punctuation", () => {
  assert.equal(
    normalizeQuestionPrompt("  Desirable   Difficulties คืออะไร？？ "),
    normalizeQuestionPrompt("desirable difficulties คืออะไร?"),
  );
});

test("skips previously saved prompts and duplicates inside one AI batch", () => {
  const unique = selectUniqueQuestions(
    ["แนวคิด Desirable Difficulties หมายถึงอะไร?"],
    [
      { prompt: "แนวคิด  Desirable Difficulties หมายถึงอะไร？？", kind: "recall" },
      { prompt: "Active Recall คืออะไร?", kind: "recall" },
      { prompt: "active recall คืออะไร？", kind: "explanation" },
      { prompt: "Spaced Repetition ใช้อย่างไร?", kind: "application" },
    ],
  );
  assert.deepEqual(
    unique.map((q) => q.prompt),
    ["Active Recall คืออะไร?", "Spaced Repetition ใช้อย่างไร?"],
  );
});

test("keeps programming questions with different internal operators", () => {
  const unique = selectUniqueQuestions(["a == b ทำงานอย่างไร?"], [
    { prompt: "a === b ทำงานอย่างไร?" },
    { prompt: "a == b ทำงานอย่างไร?" },
  ]);
  assert.deepEqual(unique.map((q) => q.prompt), ["a === b ทำงานอย่างไร?"]);
});
