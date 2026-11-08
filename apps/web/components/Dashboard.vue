<script setup lang="ts">
const {
  data,
  goalId,
  topics,
  questions,
  attempts,
  active,
  page,
  openTopic,
  openQuestion,
} = useLoop();
const now = ref(Date.now());
let timer: any;
onMounted(() => (timer = setInterval(() => (now.value = Date.now()), 30000)));
onUnmounted(() => clearInterval(timer));
const due = computed(() =>
  questions.value.filter((q: any) => Date.parse(q.dueAt) <= now.value),
);
const rated = computed(() => attempts.value.filter((a: any) => a.rating));
const good = computed(() =>
  rated.value.length
    ? Math.round(
        (100 * rated.value.filter((a: any) => a.rating >= 3).length) /
          rated.value.length,
      ) + "%"
    : "—",
);
const weak = computed(() =>
  topics.value.filter((t: any) =>
    questions.value
      .filter((q: any) => q.topicId === t.id)
      .some((q: any) => {
        const a = attempts.value.find(
          (a: any) => a.questionId === q.id && (a.rating || a.feedback),
        );
        return a && ((a.rating && a.rating <= 2) || a.feedback?.score < 0.5);
      }),
  ),
);
const prerequisite = (id: string) =>
  data.value.links
    .filter((l: any) => l.dst === id && l.kind === "prerequisite")
    .map((l: any) => topics.value.find((t: any) => t.id === l.src))
    .filter(Boolean);
const title = (id: string) =>
  questions.value.find((q: any) => q.id === id)?.prompt;
const date = (v: string) =>
  new Date(v).toLocaleString("th-TH", {
    dateStyle: "short",
    timeStyle: "short",
  });
const skills = computed(() =>
  Object.entries({
    recall: "ความจำ",
    application: "การประยุกต์",
    explanation: "การอธิบาย",
  }).map(([kind, label]) => {
    const scored = attempts.value.filter(
      (a: any) =>
        a.feedback &&
        questions.value.find((q: any) => q.id === a.questionId)?.kind === kind,
    );
    return {
      label,
      count: scored.length,
      average: scored.length
        ? Math.round(
            (scored.reduce((sum: number, a: any) => sum + a.feedback.score, 0) *
              100) /
              scored.length,
          )
        : null,
    };
  }),
);
const retention = computed(() => {
  const prior = new Map<string, number>(),
    buckets = [
      { label: "7–29 วัน", total: 0, recalled: 0 },
      { label: "30 วันขึ้นไป", total: 0, recalled: 0 },
    ];
  for (const a of [...rated.value].reverse()) {
    const at = Date.parse(a.createdAt),
      last = prior.get(a.questionId);
    prior.set(a.questionId, at);
    if (last === undefined) continue;
    const gap = (at - last) / 86400000;
    if (gap >= 7) {
      const b = buckets[gap >= 30 ? 1 : 0];
      b.total++;
      if (a.rating >= 3) b.recalled++;
    }
  }
  return buckets;
});
</script>
<template>
  <section class="hero">
    <p class="eyebrow">LEARNING DASHBOARD</p>
    <h1>วันนี้เรียนอะไรดี?</h1>
    <p>{{ data.goals.find((g: any) => g.id === goalId)?.title }}</p>
    <button
      @click="
        active
          ? openTopic(active.topicId)
          : due.length
            ? openQuestion(due[0].id)
            : (page = 'learn')
      "
    >
      {{
        active
          ? "เรียนต่อจากครั้งก่อน"
          : due.length
            ? "เริ่มทบทวน"
            : "เปิดห้องเรียน"
      }}
    </button>
  </section>
  <div class="stats">
    <article
      v-for="[n, label] in [
        [due.length, 'คำถามถึงกำหนด'],
        [good, 'จำได้ดี · ประเมินเอง'],
        [topics.length, 'หัวข้อในเป้าหมาย'],
      ]"
    >
      <strong>{{ n }}</strong
      >{{ label }}
    </article>
  </div>
  <div class="columns">
    <section class="card">
      <h2>คิวฝึกวันนี้</h2>
      <p v-if="!due.length">ยังไม่มีคำถามถึงกำหนด</p>
      <div v-for="q in due.slice(0, 8)" class="item">
        <b>{{ q.prompt }}</b
        ><button class="light" @click="openQuestion(q.id)">ฝึกจำ</button>
      </div>
    </section>
    <section class="card">
      <h2>จุดที่ควรฝึกเพิ่ม</h2>
      <p v-if="!weak.length">
        เมื่อผลการตอบชี้ว่ามีจุดที่ควรทบทวน หัวข้อจะปรากฏที่นี่
      </p>
      <div v-for="t in weak" class="entry">
        <button class="light" @click="openTopic(t.id)">{{ t.title }}</button>
        <p v-for="p in prerequisite(t.id)">
          ทบทวนพื้นฐานก่อน
          <button class="link" @click="openTopic(p.id)">{{ p.title }}</button>
        </p>
      </div>
    </section>
  </div>
  <div class="columns">
    <section class="card">
      <h2>คะแนน AI แยกตามทักษะ</h2>
      <div class="item" v-for="s in skills">
        <b>{{ s.label }}</b
        ><span>{{
          s.count ? s.average + "% · " + s.count + " คำตอบ" : "รอผลประเมิน"
        }}</span>
      </div>
    </section>
    <section class="card">
      <h2>ความจำหลังเว้นช่วง</h2>
      <small>ใช้ระยะห่างระหว่างการตอบข้อเดิมและผลประเมินตนเอง</small>
      <div class="item" v-for="r in retention">
        <b>{{ r.label }}</b
        ><span>{{
          r.total
            ? "จำได้ดี " + r.recalled + " / " + r.total + " ครั้ง"
            : "ยังไม่มีผลในช่วงนี้"
        }}</span>
      </div>
    </section>
  </div>
  <section class="card">
    <h2>ประวัติการฝึก</h2>
    <p v-if="!rated.length">ยังไม่มีการให้คะแนน</p>
    <div v-for="a in rated.slice(0, 15)" class="entry">
      <b>{{ title(a.questionId) }}</b>
      <p>
        {{ ["", "Again", "Hard", "Good", "Easy"][a.rating] }} ·
        {{ date(a.createdAt) }} · นัดถัดไป {{ date(a.nextDue) }}
        <span v-if="a.feedback">
          · คะแนน AI {{ Math.round(a.feedback.score * 100) }}%</span
        >
      </p>
    </div>
  </section>
</template>
