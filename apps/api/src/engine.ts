export const phases = [
  "เชื่อมกับความรู้เดิม",
  "อ่านและเชื่อมโยง",
  "ตอบจากความจำ",
  "ฝึกประยุกต์ข้ามหัวข้อ",
  "อธิบายให้เข้าใจง่าย",
];
export function minutes(total: number) {
  const parts = [0.1, 0.27, 0.2, 0.27].map((x) => Math.round(total * x));
  return [...parts, total - parts.reduce((a, b) => a + b, 0)];
}
export function nextReview(
  rating: number,
  prior: number,
  confidence: number,
  score: number | null,
  now = Date.now(),
) {
  const level = score !== null && score < 0.5 ? Math.min(rating, 2) : rating;
  const multiplier = confidence <= 2 ? 0.75 : 1;
  const days =
    level === 1
      ? 0
      : level === 2
        ? 1
        : Math.min(
            365,
            Math.max(
              level === 3 ? 3 : 7,
              Math.round(prior * (level === 3 ? 2 : 3) * multiplier),
            ),
          );
  return { days, dueAt: new Date(now + (days ? days * 86400000 : 600000)) };
}
export function chunks(text: string) {
  return Array.from(text.matchAll(/[\s\S]{1,1800}/gu), (m) => m[0]);
}
export function hasCycle(
  edges: { src: string; dst: string }[],
  src: string,
  dst: string,
) {
  const queue = [dst],
    seen = new Set<string>();
  while (queue.length) {
    const n = queue.pop()!;
    if (n === src) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const e of edges) if (e.src === n) queue.push(e.dst);
  }
  return false;
}
