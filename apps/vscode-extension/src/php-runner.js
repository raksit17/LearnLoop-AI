"use strict";
// PHP coding lessons run only when the learner explicitly clicks Run Tests.
// PHP executes locally as the learner: it is NOT sandboxed. Trust your code.
const { spawn } = require("node:child_process");
const { isDeepStrictEqual } = require("node:util");

const bootstrap = String.raw`
error_reporting(E_ALL);
ini_set('display_errors', '0');
set_error_handler(function($severity, $message) { throw new ErrorException($message, 0, $severity); });
try {
  $request = json_decode(stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR);
  $source = trim($request['code']);
  $source = preg_replace('/^<\?php\s*/', '', $source);
  $source = preg_replace('/\?>\s*$/', '', $source);
  ob_start();
  eval($source);
  if (!function_exists('solve')) throw new RuntimeException('ต้องประกาศ function solve($input)');
  $answer = solve($request['input']);
  ob_end_clean();
  echo json_encode(['actual' => $answer], JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE);
} catch (Throwable $e) {
  if (ob_get_level()) ob_end_clean();
  echo json_encode(['error' => get_class($e) . ': ' . $e->getMessage()], JSON_INVALID_UTF8_SUBSTITUTE);
}
`;
function runCase(code, input) {
  return new Promise((resolve, reject) => {
    let stdout = "", stderr = "", settled = false, timedOut = false;
    const child = spawn("php", ["-n", "-d", "memory_limit=64M", "-r", bootstrap], {
      stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
    });
    const timeout = setTimeout(() => { timedOut = true; child.kill(); }, 5000);
    const finish = (err, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (err) reject(err); else resolve(result);
    };
    child.on("error", error => finish(new Error(error.code === "ENOENT"
      ? "ไม่พบ PHP CLI ใน PATH: ติดตั้ง PHP 8+ แล้วตรวจ php -v ใน VS Code Terminal"
      : error.message)));
    child.stdout.on("data", part => { stdout += part; if (stdout.length > 120000) child.kill(); });
    child.stderr.on("data", part => { stderr += part; if (stderr.length > 4000) child.kill(); });
    child.on("close", exitCode => {
      if (timedOut) return finish(null, { error: "PHP execution timeout (5 วินาที)" });
      if (stdout.length > 120000) return finish(null, { error: "PHP output too large" });
      if (exitCode !== 0) return finish(null, { error: "PHP CLI error: " + (stderr || "exit " + exitCode).slice(0, 1000) });
      try { finish(null, JSON.parse(stdout)); }
      catch { finish(null, { error: "PHP ส่งผลลัพธ์ที่อ่านเป็น JSON ไม่ได้" }); }
    });
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify({ code, input }));
  });
}
async function execute(code, exercise) {
  if (!exercise || !Array.isArray(exercise.cases) || exercise.cases.length !== 3)
    throw Error("Invalid PHP exercise");
  const cases = [];
  for (const [index, [value, expected]] of exercise.cases.entries()) {
    const result = await runCase(code, value);
    const actual = result.actual === undefined ? null : result.actual;
    const passed = !result.error && isDeepStrictEqual(actual, expected);
    cases.push({ index, actual, passed, ...(result.error ? { error: String(result.error).slice(0, 1500) } : {}) });
  }
  return cases;
}
module.exports = { execute };
