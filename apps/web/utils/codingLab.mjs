export const exercises = [
  {
    id: 'uniqueIds', title: 'ตัด ID ซ้ำในคิวงาน',
    prompt: 'คืน array ของ ID ที่ไม่ซ้ำ โดยเรียงตามครั้งแรกที่พบ',
    example: '[4, 2, 4] → [4, 2]', hint: 'ระหว่างเดินรายการ ต้องจำอะไรไว้เพื่อรู้ว่าเคยเห็น ID นี้แล้ว?',
    cases: [[[], []], [[4, 2, 4], [4, 2]], [[0, 0, 1], [0, 1]]]
  },
  {
    id: 'countStatuses', title: 'นับสถานะ HTTP จาก log',
    prompt: 'รับ array ของ HTTP status แล้วคืน object ที่จับคู่แต่ละรหัสกับจำนวนครั้งที่พบ',
    example: '[200, 404, 200] → {"200": 2, "404": 1}', hint: 'ตัวนับของรหัสที่เพิ่งพบครั้งแรกควรเริ่มจากเท่าไร?',
    cases: [[[], {}], [[200, 404, 200], {'200': 2, '404': 1}], [[500, 500], {'500': 2}]]
  },
  {
    id: 'chunkJobs', title: 'แบ่งงานเป็น batch',
    prompt: 'รับ array ของงานแล้วแบ่งเป็นกลุ่มละ 2 งาน เก็บงานที่เหลือในกลุ่มสุดท้ายตามลำดับเดิม',
    example: '[1, 2, 3] → [[1, 2], [3]]', hint: 'ลองวาดกรอบครอบงานทีละสองตัว แล้วดูว่ากรอบสุดท้ายจบที่ไหน',
    cases: [[[], []], [[1, 2, 3], [[1, 2], [3]]], [[0, 1, 2, 3], [[0, 1], [2, 3]]]]
  }
];

export function starter(exercise, attempt, sync) {
  return [
    "import assert from 'node:assert/strict';",
    "import { readFileSync, writeFileSync } from 'node:fs';",
    "import { randomUUID } from 'node:crypto';",
    '',
    '// ' + exercise.prompt,
    '// BEGIN LEARNLOOP ANSWER',
    'function solve(input) {',
    '  // เขียนคำตอบตรงนี้',
    '}',
    '// END LEARNLOOP ANSWER',
    '',
    'const cases = ' + JSON.stringify(exercise.cases) + ';',
    'const exerciseId = ' + JSON.stringify(exercise.id) + ';',
    'const attempt = ' + JSON.stringify(attempt) + ';',
    'const sync = ' + JSON.stringify(sync || null) + ';',
    runner,
    ''
  ].join('\n');
}

export function validReport(report, exercise, attempt) {
  return Boolean(attempt && report?.attempt === attempt && report.exercise === exercise.id &&
    report.total === exercise.cases.length && Number.isInteger(report.passed) &&
    report.passed >= 0 && report.passed <= report.total);
}

export function editorUrl(path, id) {
  const value = path.trim().replaceAll('\\', '/');
  if (!/^(?:[a-z]:\/|\/(?!\/))/i.test(value) || !value.endsWith('/' + id + '.mjs')) return '';
  const encoded = value.split('/').map((part, index) =>
    index === 0 && /^[a-z]:$/i.test(part) ? part : encodeURIComponent(part)).join('/');
  return 'vscode://file/' + encoded;
}

const runner = String.raw`const resultPath = new URL('./' + exerciseId + '-result.json', import.meta.url);
const retry = process.argv.includes('--retry');
let report;
if (retry) {
  report = JSON.parse(readFileSync(resultPath, 'utf8'));
  if (report.attempt !== attempt || !report.runId) throw Error('ไฟล์ผลไม่ตรงกับรอบนี้ ให้รันโจทย์อีกครั้ง');
} else {
  let passed = 0;
  for (const [input, expected] of cases) {
    try {
      assert.deepStrictEqual(await solve(structuredClone(input)), expected);
      passed++;
    } catch (error) { console.error(input, error.message); }
  }
  const source = readFileSync(new URL(import.meta.url), 'utf8');
  const answer = /^\/\/ BEGIN LEARNLOOP ANSWER\r?\n([\s\S]*?)^\/\/ END LEARNLOOP ANSWER\r?$/m.exec(source)?.[1]?.trim() || solve.toString();
  report = { exercise: exerciseId, attempt, runId: randomUUID(), answer, passed, total: cases.length };
  writeFileSync(resultPath, JSON.stringify(report));
}
console.log(report.passed + '/' + report.total + ' passed');
if (report.passed !== report.total) process.exitCode = 1;
if (sync) {
  try {
    const response = await fetch(sync.url, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sync.token },
      body: JSON.stringify(report)
    });
    if (!response.ok) throw Error('HTTP ' + response.status);
    const saved = await response.json();
    if (!saved.id) throw Error('ไม่ได้รับเลขที่บันทึก');
    console.log('บันทึกคำตอบและผลเข้า LearnLoop แล้ว');
  } catch (error) {
    console.error('ส่งไม่สำเร็จ (' + error.message + ') เก็บผลในเครื่องแล้ว ส่งซ้ำด้วย node "' + process.argv[1] + '" --retry');
    process.exitCode = 1;
  }
}`;
