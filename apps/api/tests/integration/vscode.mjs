import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { CoreModule, Database, digest } from "../../dist/core.js";
import { CodingModule } from "../../dist/coding.js";
import { CodingVscodeModule } from "../../dist/coding-vscode.js";

test("pair once, retrieve exercise, sync case reports and preserve history", async t => {
  process.env.DEV_AUTH_BYPASS = "false";
  class TestApp {}
  Module({ imports: [CoreModule, CodingModule, CodingVscodeModule] })(TestApp);
  const app = await NestFactory.create(TestApp, { logger: false });
  await app.listen(0, "127.0.0.1");
  const db = app.get(Database);
  const sid = randomUUID();
  const user = await db.user.create({
    data: { identity: sid, name: "VS Code tester", tokens: {
      create: { digest: digest(sid), expires: new Date(Date.now() + 60000) }
    } }
  });
  t.after(async () => {
    await db.user.delete({ where: { id: user.id } });
    await app.close();
  });
  const url = await app.getUrl() + "/coding";
  const headers = { cookie: "sid=" + sid, "Content-Type": "application/json" };
  const json = async (route, method, body, header = headers) => {
    const response = await fetch(url + route, {
      method, headers: header, ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    return { status: response.status, data: await response.json() };
  };
  const pair = await json("/pair/start", "POST", {});
  assert.equal(pair.status, 201);
  assert.match(pair.data.code, /^[a-f0-9]{32}$/);
  assert.equal((await json("/pair/status/" + pair.data.pairingId, "GET")).data.connected, false);
  const exchanged = await json("/pair/exchange", "POST", { code: pair.data.code, name: "VS Code Test" });
  assert.equal(exchanged.status, 201);
  assert.equal((await json("/pair/exchange", "POST", { code: pair.data.code })).status, 401);
  assert.equal((await json("/pair/status/" + pair.data.pairingId, "GET")).data.connected, true);
  const deviceHeaders = { authorization: "Bearer " + exchanged.data.token, "Content-Type": "application/json" };
  assert.equal((await json("/extension/health", "GET", undefined, deviceHeaders)).data.connected, true);
  assert.equal((await json("/extension/health", "GET", undefined, headers)).status, 401);
  const exercise = await json("/extension/exercises/safeLookup", "GET", undefined, deviceHeaders);
  assert.equal(exercise.status, 200);
  assert.equal(exercise.data.cases.length, 3);
  const runId = randomUUID();
  const body = { exerciseId: "safeLookup", runId, answer: "async function solve(input, lookup) { return lookup(input); }",
    cases: [{ index: 0, actual: "Ada" }, { index: 1, actual: null }, { index: 2, actual: null, error: "database unavailable" }] };
  const result = await json("/extension/submit", "POST", body, deviceHeaders);
  assert.equal(result.status, 201);
  assert.equal(result.data.passed, 2);
  assert.deepEqual(result.data.failedCases, [2]);
  const retry = await json("/extension/submit", "POST", body, deviceHeaders);
  assert.equal(retry.data.id, result.data.id);
  const history = await json("/history/safeLookup", "GET");
  assert.equal(history.data.length, 1);
  assert.equal(history.data[0].reports[2].error, "database unavailable");
  assert.equal(history.data[0].reports[0].passed, true);
});
