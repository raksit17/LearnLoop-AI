const { test } = require("node:test"),
  assert = require("node:assert/strict");
const { minutes, nextReview, hasCycle, chunks } = require("../dist/engine");
const { verifyQuestions, verifyFeedback, ask } = require("../dist/ai/provider");
test("session budgets and adaptive scheduling", () => {
  for (const n of [20, 30, 45, 60])
    assert.equal(
      minutes(n).reduce((a, b) => a + b),
      n,
    );
  assert.equal(nextReview(1, 5, 3, null, 0).dueAt.getTime(), 600000);
  assert.equal(nextReview(4, 9, 4, 0.3).days, 1);
  assert(nextReview(3, 10, 2, null).days < nextReview(3, 10, 5, null).days);
  assert(hasCycle([{ src: "a", dst: "b" }], "b", "a"));
  assert(!hasCycle([], "b", "a"));
});
test("source excerpts round-trip Thai and supplementary characters", () => {
  const text = "การเรียนรู้🧠\n".repeat(850);
  assert.equal(chunks(text).join(""), text);
});
test("rejects ungrounded generated questions and feedback", () => {
  const src = "The reference paragraph";
  const batch = {
    questions: ["recall", "application", "explanation"].map((kind) => ({
      kind,
      prompt: "A question?",
      key: "Answer",
      quote: "reference",
      hint: "Think",
      rubric: "Explain",
    })),
  };
  assert.equal(verifyQuestions(batch, src).length, 3);
  batch.questions[1].quote = "Invented";
  assert.throws(() => verifyQuestions(batch, src));
  const result = {
    score: 0.5,
    claims: [
      { verdict: "supported", point: "One concept", evidence: "reference" },
    ],
    nextStep: "Explain again",
  };
  assert.equal(verifyFeedback(result, src).score, 0.5);
  result.claims[0].evidence = "Fabricated";
  assert.throws(() => verifyFeedback(result, src));
});
test("Ollama uses native structured output and a local model", async (t) => {
  t.mock.method(global, "fetch", async (url, opts) => {
    assert.ok(url.endsWith("/api/chat"));
    const body = JSON.parse(opts.body);
    assert.equal(body.model, process.env.OLLAMA_MODEL || "qwen3.5:4b-q4_K_M");
    assert.equal(body.stream, false);
    assert.equal(body.think, false);
    assert.equal(body.format.properties.instructions.type, "array");
    assert.equal(opts.headers.Authorization, undefined);
    return Response.json({message:{content:JSON.stringify({instructions:["a","b","c","d","e"]})}});
  });
  assert.equal((await ask("planner", {minutes:30})).instructions.length, 5);
});
test("maps local model citations back to the exact source and rejects unknown IDs", async (t) => {
  let sourceId = "1";
  t.mock.method(global, "fetch", async (url, opts) => {
    const req = JSON.parse(opts.body);
    const input = JSON.parse(req.messages[1].content);
    assert.equal(input.evidence[0].text, "Original lesson text.");
    const question = {prompt:"A question?", hint:"Think", key:"Answer", rubric:"Explain", evidenceId:sourceId};
    return Response.json({message:{content:JSON.stringify({recall:question,application:question,explanation:question})}});
  });
  const excerpt = "Original lesson text.";
  const batch = verifyQuestions(await ask("generate",{excerpt}),excerpt);
  assert.deepEqual(batch.map(q=>q.kind),["recall","application","explanation"]);
  assert.equal(batch[0].quote,excerpt);
  sourceId = "999";
  await assert.rejects(ask("generate",{excerpt}));
});
