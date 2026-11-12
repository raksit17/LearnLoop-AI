"use strict";
const vscode = require("vscode");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const EXT_BASE = "learnloop.base";
const TOKEN_KEY = "learnloop.token";
const RUNNER = path.join(__dirname, "runner.js");
const documents = new Map();
const output = vscode.window.createOutputChannel("LearnLoop CodeLab");

function localBase(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname)
      || url.username || url.password || (url.pathname !== "/" && url.pathname !== "")
      || url.search || url.hash) throw Error("LearnLoop ต้องใช้ localhost หรือ 127.0.0.1 เท่านั้น");
  return url.origin;
}

async function api(context, route, method = "GET", body) {
  const base = context.globalState.get(EXT_BASE);
  const token = await context.secrets.get(TOKEN_KEY);
  if (!base || !token) throw Error("ยังไม่เชื่อม LearnLoop: ใช้คำสั่ง LearnLoop: Connect");
  const response = await fetch(base + "/v1/coding/" + route, {
    method,
    headers: { Authorization: "Bearer " + token, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000),
    redirect: "error",
  });
  if (!response.ok) throw Error("LearnLoop HTTP " + response.status + ": " + (await response.text()).slice(0, 160));
  return response.json();
}

async function connect(context, code, base) {
  const origin = localBase(base || context.globalState.get(EXT_BASE) || "http://localhost:4318");
  if (!/^[a-f0-9]{32}$/.test(code)) throw Error("รหัสจับคู่ไม่ถูกต้อง");
  const response = await fetch(origin + "/v1/coding/pair/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, name: "VS Code" }),
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw Error("จับคู่ไม่ได้ HTTP " + response.status + " (รหัสหมดอายุหรือใช้แล้ว)");
  const result = await response.json();
  await context.secrets.store(TOKEN_KEY, result.token);
  await context.globalState.update(EXT_BASE, origin);
  vscode.window.showInformationMessage("LearnLoop AI เชื่อมต่อกับ VS Code แล้ว");
}

async function openExercise(context, id) {
  const ex = await api(context, "extension/exercises/" + encodeURIComponent(id));
  const isAsync = ex.skill === "async";
  const starter = [
    "// LearnLoop Exercise: " + ex.id,
    "// " + ex.title,
    "// " + ex.prompt,
    "// Example: " + ex.example,
    "// Test with: LearnLoop: Run Tests and Sync Results",
    "",
    isAsync ? "async function solve(input, lookup) {" : "function solve(input) {",
    "  // เขียนโค้ดที่นี่ ไม่ต้องดาวน์โหลดไฟล์โจทย์",
    "}",
    "",
  ].join("\n");
  const doc = await vscode.workspace.openTextDocument({ language: "javascript", content: starter });
  documents.set(doc.uri.toString(), ex.id);
  await vscode.window.showTextDocument(doc, { preview: false });
  output.appendLine("Opened " + ex.id + " (untitled, no download). Save manually if you want a permanent file.");
}

function exerciseFromDocument(document) {
  return documents.get(document.uri.toString()) ||
    /^\/\/ LearnLoop Exercise: ([a-zA-Z0-9-]+)/.exec(document.getText())?.[1];
}

function runNode(code, exercise) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", ["--max-old-space-size=64", RUNNER], {
      stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
    });
    let stdout = "", stderr = "", timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, 12000);
    child.stdout.on("data", chunk => { stdout += chunk; if (stdout.length > 100000) child.kill(); });
    child.stderr.on("data", chunk => { stderr += chunk; if (stderr.length > 4000) child.kill(); });
    child.on("error", reject);
    child.on("close", code => {
      clearTimeout(timeout);
      if (timedOut) return reject(Error("Test timeout: ตรวจ loop ที่ไม่สิ้นสุด"));
      if (code !== 0) return reject(Error(stderr || "Test runner exited: " + code));
      try { resolve(JSON.parse(stdout).cases); } catch { reject(Error("อ่านผล Test ไม่สำเร็จ")); }
    });
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify({ code, exercise }));
  });
}

async function runTests(context) {
  if (!vscode.workspace.isTrusted) throw Error("กรุณา Trust Workspace ก่อนรันโค้ด");
  const doc = vscode.window.activeTextEditor?.document;
  const id = doc && exerciseFromDocument(doc);
  if (!id) throw Error("เปิดไฟล์โจทย์ LearnLoop ก่อน");
  const exercise = await api(context, "extension/exercises/" + encodeURIComponent(id));
  const source = doc.getText();
  const cases = await runNode(source, exercise);
  const pass = cases.filter(c => c.passed).length;
  output.clear();
  output.appendLine(exercise.title + " — " + pass + "/" + cases.length + " passed");
  cases.forEach(c => {
    output.appendLine("Case " + (c.index + 1) + ": " + (c.passed ? "PASS" : "FAIL"));
    if (!c.passed) output.appendLine("  Expected: " + JSON.stringify(exercise.cases[c.index][1])
      + "\n  Actual: " + JSON.stringify(c.actual) + (c.error ? "\n  Error: " + c.error : ""));
  });
  output.show(true);
  // Results sync only when Run Tests is explicitly selected, never on every keystroke.
  const payload = { exerciseId: id, runId: crypto.randomUUID(), answer: source, cases:
    cases.map(({ index, actual, error }) => ({ index, actual, ...(error ? { error } : {}) })) };
  try {
    const saved = await api(context, "extension/submit", "POST", payload);
    vscode.window.showInformationMessage("LearnLoop: ผ่าน " + saved.passed + "/" + saved.total + " · ซิงก์ผลแล้ว");
  } catch (error) {
    await context.workspaceState.update("learnloop.pending", payload);
    vscode.window.showWarningMessage("Test เสร็จแล้วแต่ส่งผลไม่สำเร็จ: " + error.message + " ใช้ LearnLoop: Retry Sync");
  }
}

async function retry(context) {
  const pending = context.workspaceState.get("learnloop.pending");
  if (!pending) return vscode.window.showInformationMessage("ไม่มีผลที่รอส่ง");
  await api(context, "extension/submit", "POST", pending);
  await context.workspaceState.update("learnloop.pending", undefined);
  vscode.window.showInformationMessage("ส่งผล LearnLoop ที่ค้างอยู่สำเร็จ");
}

async function activate(context) {
  const wrap = fn => (...args) => Promise.resolve(fn(...args)).catch(e => vscode.window.showErrorMessage("LearnLoop: " + e.message));
  context.subscriptions.push(output);
  context.subscriptions.push(vscode.commands.registerCommand("learnloop.connect", wrap(async () => {
    const code = await vscode.window.showInputBox({ prompt: "รหัสจับคู่จาก LearnLoop > ฝึกเขียนโค้ด", ignoreFocusOut: true });
    if (!code) return;
    const base = await vscode.window.showInputBox({ prompt: "LearnLoop URL", value: context.globalState.get(EXT_BASE) || "http://localhost:4318" });
    if (base) await connect(context, code.trim(), base.trim());
  })));
  context.subscriptions.push(vscode.commands.registerCommand("learnloop.openExercise", wrap(async id => {
    if (!id) {
      const catalog = await api(context, "extension/catalog");
      const picked = await vscode.window.showQuickPick(catalog.exercises.map(ex => ({ label: ex.title, description: ex.skill, detail: ex.prompt, id: ex.id })), { placeHolder: "เลือกโจทย์ LearnLoop" });
      if (!picked) return;
      id = picked.id;
    }
    await openExercise(context, id);
  })));
  context.subscriptions.push(vscode.commands.registerCommand("learnloop.runTests", wrap(() => runTests(context))));
  context.subscriptions.push(vscode.commands.registerCommand("learnloop.retrySync", wrap(() => retry(context))));
  context.subscriptions.push(vscode.window.registerUriHandler({ handleUri: wrap(async uri => {
    const query = new URLSearchParams(uri.query);
    if (uri.path === "/connect") {
      await connect(context, query.get("code") || "", query.get("base") || "http://localhost:4318");
    } else if (uri.path === "/exercise") {
      const requestedBase = localBase(query.get("base") || "http://localhost:4318");
      if (requestedBase !== context.globalState.get(EXT_BASE))
        throw Error("เซิร์ฟเวอร์ไม่ตรงกับที่เชื่อมต่อ กรุณาจับคู่ใหม่");
      const id = query.get("id");
      if (!id || !/^[a-zA-Z0-9-]{1,90}$/.test(id)) throw Error("โจทย์ไม่ถูกต้อง");
      await openExercise(context, id);
    }
  }) }));
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.text = "$(beaker) LearnLoop: Run Tests";
  status.tooltip = "Run local CodeLab tests and sync results to LearnLoop";
  status.command = "learnloop.runTests";
  status.show();
  context.subscriptions.push(status);
}
function deactivate() {}
module.exports = { activate, deactivate };
