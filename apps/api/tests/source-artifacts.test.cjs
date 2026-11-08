const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ask, readingAid, mindMap } = require("../dist/ai/provider");

const aid = {
  title: "การเรียนรู้แบบเว้นระยะ",
  summary: "การทบทวนด้วยระยะห่างช่วยให้จดจำข้อมูลได้ดีขึ้นในระยะยาว",
  sections: [
    {
      heading: "แนวคิดสำคัญ",
      explanation: "สลับระยะเวลาของการฝึกเรียกคืนความจำเพื่อพัฒนาการเรียนรู้",
      bullets: ["ฝึกจำด้วยตนเอง", "เว้นช่วงระหว่างการทบทวน"],
    },
  ],
  keyPoints: ["ทบทวนเป็นระยะ", "ทดสอบการดึงความจำ"],
  glossary: [{ term: "Spacing", meaning: "การเว้นระยะระหว่างการฝึก" }],
};
const map = {
  root: "การเรียนรู้",
  branches: [
    { label: "ทำความเข้าใจ", children: ["อ่านเนื้อหา", "สรุปประเด็น"] },
    { label: "ทบทวน", children: ["ฝึกเรียกคืนความจำ", "เว้นระยะ"] },
  ],
};

test("AI reading aid returns a validated structured summary", async (t) => {
  t.mock.method(global, "fetch", async (url, options) => {
    const request = JSON.parse(options.body);
    assert.equal(request.format.properties.sections.type, "array");
    assert.equal(request.format.properties.keyPoints.type, "array");
    assert.equal(request.messages[1].role, "user");
    const input = JSON.parse(request.messages[1].content);
    assert.match(input.evidence[0].text, /การทบทวน/);
    return Response.json({ message: { content: JSON.stringify(aid) } });
  });
  const actual = await ask("reading-aid", { title: "ทดสอบ", excerpt: "การทบทวนเป็นระยะช่วยจดจำข้อมูล" });
  assert.deepEqual(actual, aid);
  assert.deepEqual(readingAid.parse(actual), aid);
});

test("AI mindmap returns structured branches, rejects invalid result", async (t) => {
  let payload = map;
  t.mock.method(global, "fetch", async (url, options) => {
    const request = JSON.parse(options.body);
    assert.equal(request.format.properties.branches.type, "array");
    return Response.json({ message: { content: JSON.stringify(payload) } });
  });
  assert.deepEqual(await ask("mindmap", { excerpt: "การฝึกอ่านและทบทวน" }), map);
  assert.deepEqual(mindMap.parse(map), map);
  payload = { root: "บันทึก", branches: [] };
  await assert.rejects(ask("mindmap", { excerpt: "การฝึกอ่านและทบทวน" }));
});

test("rejects malformed reading aids and mind maps", () => {
  assert.throws(() => readingAid.parse({ title: "หัวข้อ", summary: "สั้นเกินไป", sections: [], keyPoints: [], glossary: [] }));
  assert.throws(() => mindMap.parse({ root: "หัวข้อ", branches: [{ label: "A", children: [] }] }));
});
