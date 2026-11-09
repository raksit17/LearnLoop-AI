const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildStudyPlan } = require("../dist/study-plan");

const q = (id, topicId, kind, dueAt) => ({
  id, topicId, kind, prompt: "คำถาม " + id, dueAt,
});
test("all durations have five meaningful timed phases and eight learning strategies", () => {
  for (const total of [20, 30, 45, 60]) {
    const result = buildStudyPlan("topic1", "Node.js", total, []);
    assert.equal(result.length, 5);
    assert.equal(result.reduce((sum, phase) => sum + phase.minutes, 0), total);
    assert(result.every(p => p.minutes > 0 && p.purpose && p.checkpoint));
    assert.match(result.map(p => p.strategy).join(" "), /Priming.*Elaboration.*Dual Coding.*Retrieval.*Interleaving.*Difficulties.*Feynman.*Rest/);
    assert.equal(result[2].questionId, null, "empty-question fallback");
  }
});
test("retrieval prioritizes due questions and mixed picks another topic", () => {
  const items = [
    q("future", "topic1", "recall", "2027-01-01"),
    q("due", "topic1", "recall", "2026-01-01"),
    q("other", "topic2", "application", "2026-02-01"),
  ];
  const plan = buildStudyPlan("topic1", "SQL Index", 45, items, [], Date.parse("2026-11-09"));
  assert.equal(plan[2].questionId, "due");
  assert.equal(plan[3].questionId, "other");
  assert.equal(plan[3].questionPrompt, "คำถาม other");
});
test("AI tips enhance, but cannot override evidence-based steps", () => {
  const plan = buildStudyPlan("t", "JWT", 30, [], [
    "ถามว่า JWT ต่างจาก Session อย่างไร", "อ่านบทเรียน", "ตอบเอง", "ประยุกต์", "สรุป",
  ]);
  assert.equal(plan[0].aiTip, "ถามว่า JWT ต่างจาก Session อย่างไร");
  assert.match(plan[2].strategy, /Retrieval/);
  assert.match(plan[4].instruction, /พักสายตา/);
});
