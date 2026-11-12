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

export function starter(exercise, attempt) {
  return [
    "import assert from 'node:assert/strict';",
    "import { writeFileSync } from 'node:fs';",
    '',
    '// ' + exercise.prompt,
    'function solve(input) {',
    '  // เขียนคำตอบตรงนี้',
    '}',
    '',
    'const cases = ' + JSON.stringify(exercise.cases) + ';',
    'let passed = 0;',
    'for (const [input, expected] of cases) {',
    '  try {',
    '    assert.deepStrictEqual(solve(structuredClone(input)), expected);',
    '    passed++;',
    '  } catch (error) { console.error(input, error.message); }',
    '}',
    'const report = { exercise: ' + JSON.stringify(exercise.id) + ', attempt: ' + JSON.stringify(attempt) + ', passed, total: cases.length };',
    "writeFileSync(new URL('./' + report.exercise + '-result.json', import.meta.url), JSON.stringify(report));",
    "console.log(passed + '/' + cases.length + ' passed');",
    'if (passed !== cases.length) process.exitCode = 1;',
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
