import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { CoreModule, Database, digest } from "../../dist/core.js";
import { CodingModule } from "../../dist/coding.js";
import { CodingVscodeModule } from "../../dist/coding-vscode.js";
import { CodingCustomController } from "../../dist/coding-custom.js";
import { CodingLessonController } from "../../dist/coding-lesson.js";

test("PHP chapter generates teaching units and tests, imports to classroom, and syncs with VS Code", async t => {
  process.env.DEV_AUTH_BYPASS = "false";
  class App {}
  Module({ imports: [CoreModule, CodingModule, CodingVscodeModule],
    controllers: [CodingCustomController, CodingLessonController] })(App);
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
    const user = await db.user.create({ data: {
      identity: sid, name: "PHP learner",
      tokens: { create: { digest: digest(sid), expires: new Date(Date.now() + 60000) } },
    } });
    users.push(user.id);
    return { user, headers: { cookie: "sid=" + sid, "Content-Type": "application/json" } };
  }
  const owner = await member(), other = await member();
  const goal = await db.goal.create({ data: { userId: owner.user.id, domain: "Programming", title: "PHP" } });
  const topic = await db.topic.create({ data: { goalId: goal.id, title: "บทที่ 1 — PHP Fundamentals" } });
  const lesson = "# บทที่ 1 — PHP Fundamentals\n".repeat(3)
    + "Variables in PHP start with $. Arrays can be indexed or associative. "
    + "Use foreach to loop through employee data and conditions to filter salary. "
    + "Functions use typed arguments and return values, while OOP uses classes, objects, constructor and access modifiers. "
    + "Filter employees with salary greater than 30000. This chapter leads into Laravel MVC.";
  const units = [
    { title: "Variables PHP", lesson: "ตัวแปรใน PHP ใช้ $ นำหน้า และสามารถใช้ชนิดข้อมูลได้ เช่น string และ float",
      prompt: "เขียน solve($input) คืนค่าตัวแปรที่ได้รับเป็นข้อความ",
      hint: "ลองใช้การแปลงเป็นข้อความ", example: "1 -> '1'", skill: "custom", level: 1,
      cases: [["1", "1"], ["Bob", "Bob"], ["", ""]] },
    { title: "PHP Arrays", lesson: "PHP ใช้ indexed array และ associative array สำหรับเก็บ Employee ที่ประกอบด้วยชื่อและเงินเดือน",
      prompt: "เขียน solve($input) คืนอาร์เรย์ที่ไม่มีค่าซ้ำ รักษาลำดับเดิม",
      hint: "ใช้ array_unique และ array_values", example: "[1,1] -> [1]", skill: "custom", level: 2,
      cases: [[[], []], [[1,1], [1]], [[2,1,2], [2,1]]] },
    { title: "Employee Workshop", lesson: "ใช้ foreach ตรวจเงินเดือนของ Employee ทีละคน แล้วคืนรายชื่อที่มีเงินเดือนเกิน 30000",
      prompt: "เขียน solve($input) คืนรายชื่อพนักงานที่ salary > 30000",
      hint: "ใช้ foreach กับ if ตรวจ salary", example: "Employee array -> names",
      skill: "custom", level: 3,
      cases: [[[], []], [[{name:"Bob",salary:35000}],["Bob"]],
        [[{name:"John",salary:25000},{name:"Alice",salary:40000}],["Alice"]]] },
  ];
  const server = createServer(async (req,res) => {
    res.setHeader("Content-Type","application/json");
    if (req.url === "/api/tags") return res.end(JSON.stringify({
      models: [{ name: process.env.OLLAMA_MODEL || "qwen3.5:4b-q4_K_M" }],
    }));
    let body = "";
    for await (const chunk of req) body += chunk;
    const payload = JSON.parse(body);
    assert.ok(payload.messages[1].content.includes("PHP Fundamentals"));
    const reply = { title: "บทที่ 1 — PHP Fundamentals", overview: "เรียน PHP พื้นฐานจากตัวแปรจนสร้างโปรแกรม Employee",
      units: units.map(u => ({ ...u, lesson: u.lesson + " อ่านตัวอย่างและทดลองด้วยตัวเอง",
        cases: u.cases.map(([input, expected]) => ({
          inputJson: JSON.stringify(input), expectedJson: JSON.stringify(expected),
        })) })) };
    res.end(JSON.stringify({ message: { content: JSON.stringify(reply) } }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  process.env.OLLAMA_URL = "http://127.0.0.1:" + server.address().port;
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = await app.getUrl() + "/coding";
  async function request(route, method = "GET", body, headers = owner.headers) {
    const response = await fetch(url + route, { method, headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  }

  const preview = await request("/lesson/preview", "POST",
    { topicId: topic.id, sourceId: null, text: lesson, language: "php", count: 3 });
  assert.equal(preview.status, 201);
  assert.equal(preview.body.units.length, 3);
  assert.ok(preview.body.units.every(x => x.cases.length === 3 && x.skill === "custom"));
  assert.equal((await request("/custom")).body.length, 0);
  const imported = await request("/lesson/import", "POST", {
    topicId: topic.id, sourceId: null, sourceTitle: "บทที่ 1 — PHP Fundamentals",
    sourceText: lesson, language: "php", units: preview.body.units,
  });
  assert.equal(imported.status, 201);
  assert.equal(imported.body.created.length, 3);
  assert.equal(imported.body.sourceCreated, true);
  assert.equal((await request("/lesson/sources?topicId=" + topic.id)).body.length, 1);
  const source = await db.source.findUniqueOrThrow({ where: { id: imported.body.sourceId } });
  assert.equal(source.chunks.join(""), lesson);

  const repeated = await request("/lesson/import", "POST", {
    topicId: topic.id, sourceId: null, sourceTitle: "บทที่ 1 — PHP Fundamentals",
    sourceText: lesson, language: "php", units: preview.body.units,
  });
  assert.equal(repeated.body.created.length, 0);
  assert.equal(repeated.body.skipped, 3);
  const own = await request("/custom");
  assert.equal(own.body.length, 3);
  assert.ok(own.body.every(x => x.language === "php" && x.lesson.length > 20 && x.ready));
  assert.equal((await request("/custom", "GET", undefined, other.headers)).body.length, 0);
  assert.equal((await request("/lesson/sources?topicId=" + topic.id, "GET", undefined, other.headers)).status, 404);

  const pair = await request("/pair/start", "POST", {});
  const exchanged = await request("/pair/exchange", "POST", { code: pair.body.code, name: "PHP VS Code" });
  const auth = { authorization: "Bearer " + exchanged.body.token, "Content-Type": "application/json" };
  const exercise = await request("/extension/exercises/" + imported.body.created[1], "GET", undefined, auth);
  assert.equal(exercise.body.language, "php");
  assert.equal(exercise.body.cases.length, 3);
  assert.equal((await request("/files", "POST", { exercise: imported.body.created[1] })).status, 400);
  const report = await request("/extension/submit", "POST", {
    exerciseId: imported.body.created[1], runId: randomUUID(),
    answer: "<?php function solve($input) { return array_values(array_unique($input)); }",
    cases: [{index:0,actual:[]},{index:1,actual:[1]},{index:2,actual:[2,1]}],
  }, auth);
  assert.equal(report.body.passed, 3);
  assert.equal((await request("/history/" + imported.body.created[1])).body.length, 1);
});
