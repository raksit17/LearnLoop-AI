export type Exercise = {
  id: string; title: string; prompt: string; skill: string; level: number;
  example: string; hint: string; cases: [unknown, unknown][];
};
export const skills: Record<string, string> = { collection: "ลำดับและข้อมูลซ้ำ", counts: "การนับและรวมข้อมูล", batch: "การแบ่งกลุ่มและกรณีขอบ", async: "Promise และการจัดการข้อผิดพลาด" };
export const library: Exercise[] = [
  {"id":"uniqueIds","title":"ตัด ID ซ้ำในคิวงาน","prompt":"คืน array ของ ID ที่ไม่ซ้ำ โดยเรียงตามครั้งแรกที่พบ","example":"[4, 2, 4] → [4, 2]","hint":"ระหว่างเดินรายการ ต้องจำอะไรไว้เพื่อรู้ว่าเคยเห็น ID นี้แล้ว?","cases":[[[],[]],[[4,2,4],[4,2]],[[0,0,1],[0,1]]],"level":1,"skill":"collection"},
  {"id":"countStatuses","title":"นับสถานะ HTTP จาก log","prompt":"รับ array ของ HTTP status แล้วคืน object ที่จับคู่แต่ละรหัสกับจำนวนครั้งที่พบ","example":"[200, 404, 200] → {\"200\": 2, \"404\": 1}","hint":"ตัวนับของรหัสที่เพิ่งพบครั้งแรกควรเริ่มจากเท่าไร?","cases":[[[],{}],[[200,404,200],{"200":2,"404":1}],[[500,500],{"500":2}]],"level":1,"skill":"counts"},
  {"id":"chunkJobs","title":"แบ่งงานเป็น batch","prompt":"รับ array ของงานแล้วแบ่งเป็นกลุ่มละ 2 งาน เก็บงานที่เหลือในกลุ่มสุดท้ายตามลำดับเดิม","example":"[1, 2, 3] → [[1, 2], [3]]","hint":"ลองวาดกรอบครอบงานทีละสองตัว แล้วดูว่ากรอบสุดท้ายจบที่ไหน","cases":[[[],[]],[[1,2,3],[[1,2],[3]]],[[0,1,2,3],[[0,1],[2,3]]]],"level":1,"skill":"batch"},
  {"id":"mergeIds","title":"รวม ID จากหลายคิว","prompt":"รวมคิวหลายชุด ตัด ID ซ้ำและรักษาลำดับแรกที่พบ","skill":"collection","level":2,"cases":[[[],[]],[[[1,2],[2,3]],[1,2,3]],[[[],[0,0]],[0]]],"example":"[[1,2],[2,3]] → [1,2,3]","hint":"ลองไล่ค่าของตัวอย่างทีละรายการ"},
  {"id":"latestUsers","title":"เลือกเวอร์ชันล่าสุด","prompt":"รับคู่ [id, version] คืนคู่ที่ version สูงสุดของแต่ละ id ตามลำดับที่พบ id ครั้งแรก","skill":"collection","level":3,"cases":[[[],[]],[[[2,1],[1,3],[2,4]],[[2,4],[1,3]]],[[[1,5],[1,2]],[[1,5]]]],"example":"[[2,1],[1,3],[2,4]] → [[2,4],[1,3]]","hint":"ลองไล่ค่าของตัวอย่างทีละรายการ"},
  {"id":"statusGroups","title":"สรุปสถานะตามกลุ่ม","prompt":"คืนจำนวนรหัส HTTP แยกตามเลขหลักร้อย เช่น 200 และ 201 อยู่ในกลุ่ม 2xx","skill":"counts","level":2,"cases":[[[],{}],[[200,201,404],{"2xx":2,"4xx":1}],[[503,500],{"5xx":2}]],"example":"[200,201,404] → {\"2xx\":2,\"4xx\":1}","hint":"ลองไล่ค่าของตัวอย่างทีละรายการ"},
  {"id":"errorRates","title":"คำนวณอัตรา error","prompt":"รับคู่ [service,status] แล้วคืนสัดส่วน status >= 400 ต่อจำนวน request ของแต่ละ service","skill":"counts","level":3,"cases":[[[],{}],[[["a",200],["a",503],["b",404]],{"a":0.5,"b":1}],[[["a",204]],{"a":0}]],"example":"[[\"a\",200],[\"a\",503],[\"b\",404]] → {\"a\":0.5,\"b\":1}","hint":"ลองไล่ค่าของตัวอย่างทีละรายการ"},
  {"id":"batchLimit","title":"แบ่ง batch ตามขนาด","prompt":"รับ {jobs,limit} แบ่ง jobs ตาม limit ถ้า limit น้อยกว่า 1 คืน []","skill":"batch","level":2,"cases":[[{"jobs":[],"limit":2},[]],[{"jobs":[1,2,3],"limit":2},[[1,2],[3]]],[{"jobs":[1],"limit":0},[]]],"example":"{\"jobs\":[1,2,3],\"limit\":2} → [[1,2],[3]]","hint":"ลองไล่ค่าของตัวอย่างทีละรายการ"},
  {"id":"weightedBatch","title":"จัดคิวตามน้ำหนักงาน","prompt":"แบ่งน้ำหนักงานตามลำดับเป็น batch ที่ผลรวมไม่เกิน 5 ใส่งานเดี่ยวที่หนักเกิน 5 ไว้ลำพัง","skill":"batch","level":3,"cases":[[[],[]],[[2,3,1,4],[[2,3],[1,4]]],[[6,1,5],[[6],[1],[5]]]],"example":"[2,3,1,4] → [[2,3],[1,4]]","hint":"ลองไล่ค่าของตัวอย่างทีละรายการ"},
  {"id":"awaitLookup","title":"อ่านข้อมูลจาก Promise","prompt":"เรียก await lookup(id) แล้วคืนค่าที่ได้ ฟังก์ชัน lookup ส่ง null เมื่อไม่พบ","skill":"async","level":1,"cases":[[1,"Ada"],[2,null],[3,"Lin"]],"example":"2 → null","hint":"ลองแยกกรณี resolve, ไม่พบ และ reject"},
  {"id":"safeLookup","title":"รับมือ Promise rejection","prompt":"เรียก lookup(id) แล้วคืนชื่อ หรือ null เมื่อไม่พบ หรือ 'retry' เมื่อ Promise reject","skill":"async","level":2,"cases":[[1,"Ada"],[2,null],[-1,"retry"]],"example":"2 → null","hint":"ลองแยกกรณี resolve, ไม่พบ และ reject"},
  {"id":"serviceLookup","title":"จำลอง Controller → Service → Database","prompt":"ใช้ lookup(id) จำลองฐานข้อมูล คืน {status,body} โดยให้ 200 พร้อมชื่อเมื่อพบ 404 พร้อม null เมื่อไม่พบ และ 503 พร้อม null เมื่อฐานข้อมูล reject","skill":"async","level":3,"cases":[[1,{"status":200,"body":"Ada"}],[2,{"status":404,"body":null}],[-1,{"status":503,"body":null}]],"example":"2 → {\"status\":404,\"body\":null}","hint":"ลองแยกกรณี resolve, ไม่พบ และ reject"}
];

const transferCases: Record<string, [unknown, unknown]> = {
 "uniqueIds": [
  [
   7,
   0,
   7,
   8,
   0
  ],
  [
   7,
   0,
   8
  ]
 ],
 "chunkJobs": [
  [
   1,
   2,
   3,
   4,
   5
  ],
  [
   [
    1,
    2
   ],
   [
    3,
    4
   ],
   [
    5
   ]
  ]
 ],
 "countStatuses": [
  [
   429,
   200,
   429
  ],
  {
   "200": 1,
   "429": 2
  }
 ],
 "mergeIds": [
  [
   [
    5
   ],
   [
    4,
    5
   ],
   [
    0
   ]
  ],
  [
   5,
   4,
   0
  ]
 ],
 "latestUsers": [
  [
   [
    9,
    7
   ],
   [
    2,
    1
   ],
   [
    9,
    2
   ]
  ],
  [
   [
    9,
    7
   ],
   [
    2,
    1
   ]
  ]
 ],
 "statusGroups": [
  [
   301,
   304,
   503
  ],
  {
   "3xx": 2,
   "5xx": 1
  }
 ],
 "errorRates": [
  [
   [
    "api",
    400
   ],
   [
    "api",
    404
   ],
   [
    "api",
    200
   ],
   [
    "api",
    200
   ]
  ],
  {
   "api": 0.5
  }
 ],
 "batchLimit": [
  {
   "jobs": [
    0,
    1,
    2,
    3,
    4
   ],
   "limit": 3
  },
  [
   [
    0,
    1,
    2
   ],
   [
    3,
    4
   ]
  ]
 ],
 "weightedBatch": [
  [
   4,
   2,
   3,
   7,
   1
  ],
  [
   [
    4
   ],
   [
    2,
    3
   ],
   [
    7
   ],
   [
    1
   ]
  ]
 ],
 "awaitLookup": [
  0,
  null
 ],
 "safeLookup": [
  -7,
  "retry"
 ],
 "serviceLookup": [
  3,
  {
   "status": 200,
   "body": "Lin"
  }
 ]
};

// Give each failed case its own runnable exercise, including evidence from the original run.
export function drill(base: Exercise, index: number): Exercise {
  const focus = base.cases[index];
  const foundation = library.find(item => item.skill === base.skill && item.level === 1)!;
  const cases = [focus, transferCases[base.id], base.cases[(index + 1) % base.cases.length]];
  return { ...base, id: 'review-' + base.id + '-' + index,
    title: 'ทบทวน ' + base.title + ' · กรณี ' + (index + 1),
    prompt: base.prompt + ' ก่อนลงมือ ให้ทำนายผลสำหรับ ' + JSON.stringify(focus[0]) + ' และเขียนเหตุผล',
    example: JSON.stringify(focus[0]) + ' → ' + JSON.stringify(focus[1]),
    hint: foundation.hint, cases };
}
export function findExercise(id: string): Exercise | undefined {
  const match = /^review-([a-zA-Z]+)-([012])$/.exec(id);
  const base = library.find(item => item.id === (match?.[1] ?? id));
  return base && match ? drill(base, Number(match[2])) : base;
}
