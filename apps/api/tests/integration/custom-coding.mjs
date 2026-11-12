import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Module } from "@nestjs/common";
import { CoreModule, Database, digest } from "../../dist/core.js";
import { CodingModule } from "../../dist/coding.js";
import { CodingVscodeModule } from "../../dist/coding-vscode.js";
import { CodingCustomController } from "../../dist/coding-custom.js";

test("custom prompts support draft, CRUD, classroom topic, VS Code sync, and ownership", async t => {
  process.env.DEV_AUTH_BYPASS = "false";
  class App {}
  Module({ imports: [CoreModule, CodingModule, CodingVscodeModule], controllers: [CodingCustomController] })(App);
  const app = await NestFactory.create(App, { logger: false });
  await app.listen(0, "127.0.0.1");
  const db = app.get(Database);
  const users = [];
  t.after(async () => {
    for (const id of users) await db.user.delete({ where: { id } });
    await app.close();
  });
  async function member() {
    const sid = randomUUID();
    const user = await db.user.create({ data: { identity: sid, name: "custom tester",
      tokens: { create: { digest: digest(sid), expires: new Date(Date.now() + 60000) } } } });
    users.push(user.id);
    return { user, headers: { cookie: "sid=" + sid, "Content-Type": "application/json" } };
  }
  const owner = await member();
  const outsider = await member();
  const goal = await db.goal.create({ data: { userId: owner.user.id, title: "Backend", domain: "Programming" } });
  const topic = await db.topic.create({ data: { goalId: goal.id, title: "Async/Await", notes: "Promise reject ต้องจับ exception" } });
  const root = (await app.getUrl()) + "/coding";
  async function send(route, method = "GET", body, headers = owner.headers) {
    const res = await fetch(root + route, { method, headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: res.status, body: await res.json() };
  }

  const payload = { title: "handle null", prompt: "เขียน solve(input) รับ input แล้วคืน input เดิม", hint: "",
    example: "1 -> 1", skill: "custom", level: 1, topicId: topic.id, cases: [] };
  const draft = await send("/custom", "POST", payload);
  assert.equal(draft.status, 201);
  assert.equal(draft.body.ready, false);
  const customId = draft.body.id;
  const dbId = customId.replace(/^custom-/, "");
  assert.equal((await send("/custom", "GET")).body[0].topic.title, "Async/Await");
  assert.equal((await send("/extension/exercises/" + customId)).status, 401);
  assert.equal((await send("/files", "POST", { exercise: customId })).status, 404);
  assert.equal((await send("/custom", "GET", undefined, outsider.headers)).body.length, 0);
  assert.equal((await send("/custom/" + dbId, "PATCH", payload, outsider.headers)).status, 404);

  const tests = [[[],[]],[ [4,2,4],[4,2] ],[[0,0,1],[0,1]]];
  const updated = await send("/custom/" + dbId, "PATCH", { ...payload,
    title: "unique array", prompt: "เขียน solve(input) คืน array ที่ไม่มีค่าซ้ำโดยรักษาลำดับ", cases: tests,
    skill: "collection" });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.ready, true);
  const plan = await send("/plan");
  assert.ok(plan.body.catalog.some(item => item.id === customId));

  const pairing = await send("/pair/start", "POST", {});
  const exchange = await send("/pair/exchange", "POST", { code: pairing.body.code, name: "custom test" });
  assert.equal(exchange.status, 201);
  const extension = { authorization: "Bearer " + exchange.body.token, "Content-Type": "application/json" };
  assert.equal((await send("/extension/exercises/" + customId, "GET", undefined, extension)).body.cases.length, 3);
  const report = await send("/extension/submit", "POST", {
    exerciseId: customId, runId: randomUUID(),
    answer: "function solve(input) { return [...new Set(input)]; }",
    cases: [
      { index: 0, actual: [] }, { index: 1, actual: [4,2,4] }, { index: 2, actual: [0,1] },
    ],
  }, extension);
  assert.equal(report.status, 201);
  assert.equal(report.body.passed, 2);
  assert.deepEqual(report.body.failedCases, [1]);
  assert.equal((await send("/history/" + customId)).body[0].reports[1].passed, false);
  assert.equal((await send("/history/" + customId, "GET", undefined, outsider.headers)).status, 404);

  const ai = createServer(async (req,res) => {
    if (req.url === "/api/tags") {
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ models: [{ name: process.env.OLLAMA_MODEL || "qwen3.5:4b-q4_K_M" }] }));
    }
    const response = { title: "แก้ค่า Array ซ้ำ", prompt: "เขียน solve(input) คืน Array ที่ไม่มีค่าซ้ำโดยรักษาลำดับ",
      hint: "ลองใช้ Set", example: "[1,1] -> [1]", skill: "collection", level: 1,
      cases: [
        { inputJson: "[]", expectedJson: "[]" },
        { inputJson: "[1,1]", expectedJson: "[1]" },
        { inputJson: "[2,2]", expectedJson: "[2]" },
      ],
    };
    res.end(JSON.stringify({ message: { content: JSON.stringify(response) } }));
  });
  await new Promise(resolve => ai.listen(0, "127.0.0.1", resolve));
  process.env.OLLAMA_URL = "http://127.0.0.1:" + ai.address().port;
  t.after(() => new Promise(resolve => ai.close(resolve)));
  const listBefore = (await send("/custom")).body.length;
  const generated = await send("/custom/draft", "POST", { prompt: "ช่วยสร้างโจทย์ Array ที่ตัดค่าซ้ำ", topicId: topic.id });
  assert.equal(generated.status, 201);
  assert.equal(generated.body.cases.length, 3);
  assert.equal((await send("/custom")).body.length, listBefore);

  const deleted = await send("/custom/" + dbId, "DELETE", { confirmTitle: "unique array" });
  assert.equal(deleted.body.ok, true);
  assert.equal((await send("/custom")).body.length, 0);
  assert.equal((await send("/extension/exercises/" + customId, "GET", undefined, extension)).status, 404);
});
