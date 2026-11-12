"use strict";
// This process runs only after the learner explicitly selects Run Tests.
// Node's vm is NOT a security sandbox; execute only code the learner trusts.
const vm = require("node:vm");
const { isDeepStrictEqual } = require("node:util");

function clean(value) {
  if (value === undefined) return { type: "undefined" };
  try { return JSON.parse(JSON.stringify(value)); }
  catch { return { type: "unserializable", value: String(value) }; }
}

async function execute(input) {
  const exercise = input.exercise;
  if (!exercise || !Array.isArray(exercise.cases) || exercise.cases.length !== 3)
    throw Error("Invalid exercise");
  const result = [];
  let solve;
  try {
    solve = new vm.Script(input.code + "\n; typeof solve === 'function' ? solve : undefined;").runInNewContext(
      { console: { log() {}, error() {} } }, { timeout: 1500 });
    if (typeof solve !== "function") throw Error("ต้องประกาศฟังก์ชัน solve(input)");
  } catch (error) {
    return exercise.cases.map((_, index) => ({ index, actual: null, error: "Compile: " + error.message }));
  }
  for (const [index, [value, expected]] of exercise.cases.entries()) {
    try {
      const lookup = async id => {
        if (id < 0) throw Error("database unavailable");
        return ({ 1: "Ada", 3: "Lin" })[id] ?? null;
      };
      const timer = new Promise((_, reject) => setTimeout(() => reject(Error("Execution timeout")), 2500));
      const actual = clean(await Promise.race([
        Promise.resolve().then(() => solve(structuredClone(value), lookup)), timer
      ]));
      result.push({ index, actual, passed: isDeepStrictEqual(actual, expected) });
    } catch (error) {
      result.push({ index, actual: null, error: String(error.message || error).slice(0, 1500), passed: false });
    }
  }
  return result;
}

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => {
  input += chunk;
  if (input.length > 200000) { process.stderr.write("Input too large"); process.exit(1); }
});
process.stdin.on("end", async () => {
  try { process.stdout.write(JSON.stringify({ cases: await execute(JSON.parse(input)) })); }
  catch (error) { process.stderr.write(String(error.message || error)); process.exitCode = 1; }
});
module.exports = { execute };
