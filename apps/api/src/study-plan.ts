import { minutes } from "./engine";

export type StudyQuestion = {
  id: string;
  topicId: string;
  prompt: string;
  kind: string;
  dueAt: Date | string;
};

export type StudyPhase = {
  name: string;
  minutes: number;
  strategy: string;
  purpose: string;
  instruction: string;
  checkpoint: string;
  questionId: string | null;
  questionPrompt: string | null;
  aiTip?: string;
};

function prioritized(questions: StudyQuestion[], now: number) {
  return [...questions].sort((a, b) => {
    const ad = new Date(a.dueAt).getTime();
    const bd = new Date(b.dueAt).getTime();
    const aDue = ad <= now ? 0 : 1;
    const bDue = bd <= now ? 0 : 1;
    return aDue - bDue || ad - bd;
  });
}

/** A concrete five-stage cycle based on the real questions in this goal.
 *  AI adds an optional, editable coaching tip but never replaces the actions.
 */
export function buildStudyPlan(
  topicId: string,
  topicName: string,
  duration: number,
  questions: StudyQuestion[],
  aiTips: string[] = [],
  now = Date.now(),
): StudyPhase[] {
  const [prime, learn, recallTime, apply, explain] = minutes(duration);
  const ranked = prioritized(questions, now);
  const same = ranked.filter(q => q.topicId === topicId);
  const recall = same.find(q => q.kind === "recall") || same[0];
  const other = ranked.filter(q => q.topicId !== topicId);
  const mixed =
    other.find(q => q.kind === "application") ||
    other[0] ||
    same.find(q => q.kind === "application" && q.id !== recall?.id) ||
    same.find(q => q.id !== recall?.id);
  const phase: StudyPhase[] = [
    {
      name: "เรียกความรู้เดิม",
      minutes: prime,
      strategy: "Mental Priming",
      purpose: "ตั้งเป้าหมายและกระตุ้นสิ่งที่เคยรู้ ก่อนรับข้อมูลใหม่",
      instruction: `ปิดโน้ตแล้วเขียน 2–3 สิ่งที่จำได้เกี่ยวกับ “${topicName}” และตั้งคำถามหนึ่งข้อที่อยากตอบให้ได้วันนี้`,
      checkpoint: "เขียนสิ่งที่จำได้และเป้าหมายของรอบนี้",
      questionId: null,
      questionPrompt: null,
    },
    {
      name: "อ่านและเชื่อมโยง",
      minutes: learn,
      strategy: "Elaboration · Dual Coding",
      purpose: "เข้าใจเหตุผลและความสัมพันธ์ ไม่ใช่แค่อ่านผ่าน",
      instruction: "อ่านบทเรียนสั้น ๆ ตั้งคำถามว่า “ทำไม” และวาดแผนภาพ 3–5 จุดที่เชื่อมเหตุและผล หรืออธิบายขั้นตอนเป็นลูกศร",
      checkpoint: "บันทึกเหตุผล 1 ข้อ และแผนภาพ/ลำดับที่อธิบายได้",
      questionId: null,
      questionPrompt: null,
    },
    {
      name: "ปิดบทเรียนแล้วตอบ",
      minutes: recallTime,
      strategy: "Active Retrieval",
      purpose: "ทดสอบการเรียกคืนความรู้โดยไม่ดูเฉลย",
      instruction: recall
        ? "ปิดบทเรียนก่อนตอบโจทย์ด้านล่างด้วยคำของตัวเอง จากนั้นค่อยตรวจเฉลยและประเมินความจำ"
        : "ยังไม่มีโจทย์ในหัวข้อนี้ ลองเขียนสิ่งสำคัญจากความจำ 3 ข้อ แล้วค่อยกลับไปตรวจต้นฉบับ",
      checkpoint: "ตอบจากความจำและจดสิ่งที่ยังผิดหรือขาด",
      questionId: recall?.id ?? null,
      questionPrompt: recall?.prompt ?? null,
    },
    {
      name: "ฝึกโจทย์สลับหัวข้อ",
      minutes: apply,
      strategy: "Interleaving · Desirable Difficulties",
      purpose: "เลือกใช้ความรู้กับสถานการณ์ที่ต่างจากตัวอย่าง",
      instruction: mixed
        ? "ลองแก้โจทย์ที่ต่างจากข้อก่อนโดยไม่ดูเทคนิคเฉลย ถ้ายากเกินไปให้ดูคำใบ้สั้น ๆ แล้วลองต่อ"
        : "สร้างโจทย์ใหม่จากบทเรียน: เปลี่ยนเงื่อนไข 1 อย่าง แล้วอธิบายว่าควรปรับวิธีแก้อย่างไร",
      checkpoint: "บันทึกวิธีเลือกแนวทาง และเหตุผลว่าทำไมใช้วิธีนั้น",
      questionId: mixed?.id ?? null,
      questionPrompt: mixed?.prompt ?? null,
    },
    {
      name: "สอนกลับและสรุป",
      minutes: explain,
      strategy: "Feynman · Feedback · Rest",
      purpose: "อธิบายให้เข้าใจง่าย ตรวจช่องว่าง แล้วพักก่อนทบทวนอีกครั้ง",
      instruction: "อธิบายหัวข้อนี้ให้มือใหม่เข้าใจใน 3 ประโยค ตรวจจุดที่ยังตอบไม่ได้ แล้วใช้ช่วงท้ายพักสายตาเงียบ ๆ 1–2 นาที",
      checkpoint: "เขียนคำอธิบาย 3 ประโยค และจดสิ่งที่ต้องกลับมาทบทวน",
      questionId: null,
      questionPrompt: null,
    },
  ];
  return phase.map((p, i) => ({
    ...p,
    ...(aiTips[i]?.trim() ? { aiTip: aiTips[i].trim() } : {}),
  }));
}
