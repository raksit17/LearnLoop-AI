const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const runner = path.join(__dirname, "..", "src", "runner.js");
const ex = { id: "safeLookup", cases: [[1,"Ada"],[2,null],[-1,"retry"]] };
function run(source, exercise = ex) {
  return new Promise((resolve,reject) => {
    const p = spawn(process.execPath,[runner]);
    let data = "", err = "";
    p.stdout.on("data",c=>data+=c);
    p.stderr.on("data",c=>err+=c);
    p.on("error",reject);
    p.on("close",code=> code===0 ? resolve(JSON.parse(data).cases) : reject(Error(err)));
    p.stdin.end(JSON.stringify({ code:source, exercise }));
  });
}
test("safeLookup passes three independent cases", async () => {
  const result = await run("async function solve(input, lookup) { try { return await lookup(input); } catch { return 'retry'; } }");
  assert.deepEqual(result.map(r=>r.passed),[true,true,true]);
});
test("Promise rejection is reported as a separate failed case", async () => {
  const result = await run("async function solve(input, lookup) { return await lookup(input); }");
  assert.deepEqual(result.map(r=>r.passed),[true,true,false]);
  assert.match(result[2].error,/database unavailable/);
});
test("missing function yields three failures", async () => {
  const result = await run("const other = 1");
  assert.equal(result.length, 3);
  assert.ok(result.every(r=>r.error?.includes("solve")));
});
test("regular array exercise works without lookup",async () => {
  const result = await run("function solve(input) { return [...new Set(input)]; }",
    {id:"uniqueIds", cases:[[[],[]],[[4,2,4],[4,2]],[[0,0,1],[0,1]]]});
  assert.ok(result.every(r=>r.passed));
});
