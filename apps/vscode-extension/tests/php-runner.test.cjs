"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { execute } = require("../src/php-runner.js");
const available = spawnSync("php", ["-v"], { encoding: "utf8" }).status === 0;
const exercise = { id: "custom-php", language: "php", cases: [[[], []], [[4, 2, 4], [4, 2]], [[0, 0, 1], [0, 1]]] };
test("PHP array exercise passes three cases", { skip: !available }, async () => {
  const cases = await execute("<?php\nfunction solve($input) { return array_values(array_unique($input)); }", exercise);
  assert.deepEqual(cases.map(c => c.passed), [true, true, true]);
});
test("PHP syntax mistakes report individual case failures", { skip: !available }, async () => {
  const cases = await execute("<?php\nfunction solve($input) { return ; invalid php code; }", exercise);
  assert.equal(cases.length, 3);
  assert.ok(cases.every(c => !c.passed && c.error));
});
test("PHP wrong results are detected", { skip: !available }, async () => {
  const cases = await execute("function solve($input) { return $input; }", exercise);
  assert.deepEqual(cases.map(c => c.passed), [true, false, false]);
});
test("Employee workshop PHP associative arrays", { skip: !available }, async () => {
  const unit = { language: "php", cases: [
    [[{ name: "John", salary: 25000 }, { name: "Alice", salary: 40000 }], ["Alice"]],
    [[], []],
    [[{ name: "Bob", salary: 35000 }], ["Bob"]],
  ] };
  const source = "<?php\nfunction solve($input) { $names = []; foreach ($input as $e) { if ($e['salary'] > 30000) $names[] = $e['name']; } return $names; }";
  const cases = await execute(source, unit);
  assert.deepEqual(cases.map(c => c.passed), [true, true, true]);
});
