<script setup lang="ts">
const {
    data,
    qId,
    questions,
    attempts,
    api,
    job,
    refresh,
    health,
    message,
    active,
    openTopic,
  } = useLoop(),
  { busy, run } = useAction();
const draft = reactive({
    answer: "",
    confidence: 3,
    hint: false,
    hintText: "",
    request: "",
    started: 0,
  }),
  shown = ref<any>(null);
const due = computed(() =>
  questions.value.find((q: any) => Date.parse(q.dueAt) <= Date.now()),
);
const pending = computed(() =>
  attempts.value.find((a: any) => !a.rating && a.questionId === qId.value),
);
const q = computed(() => questions.value.find((q: any) => q.id === qId.value));
function choose() {
  if (!q.value)
    qId.value =
      attempts.value.find((a: any) => !a.rating)?.questionId ||
      due.value?.id ||
      "";
}
choose();
function storageKey() {
  return "ll-answer:" + data.value.user.id + ":" + qId.value;
}
watch(
  qId,
  () => {
    shown.value = null;
    const saved = qId.value && localStorage.getItem(storageKey());
    Object.assign(
      draft,
      saved
        ? JSON.parse(saved)
        : {
            answer: "",
            confidence: 3,
            hint: false,
            hintText: "",
            request: crypto.randomUUID(),
            started: Date.now(),
          },
    );
  },
  { immediate: true },
);
function save() {
  localStorage.setItem(storageKey(), JSON.stringify(draft));
}
async function submit() {
  save();
  const a = await api("attempts", {
    questionId: qId.value,
    answer: draft.answer,
    confidence: draft.confidence,
    hint: draft.hint,
    seconds: Math.min(
      31536000,
      Math.floor((Date.now() - draft.started) / 1000),
    ),
    request: draft.request,
  });
  await refresh();
  await reveal(a.id);
}
async function reveal(id: string) {
  shown.value = { ...(await api("reveal", { id })), id };
}
async function hint() {
  const r = await api("hint", { q: qId.value });
  draft.hintText = r.hint || "ยังไม่มีคำใบ้";
  draft.hint = !!r.hint;
  save();
}
async function tutor() {
  const id = shown.value.id;
  await job("tutor", id);
  await reveal(id);
  await refresh();
}
async function rate(rating: number) {
  const r = await api("rating", { id: shown.value.id, rating });
  localStorage.removeItem(storageKey());
  await refresh();
  shown.value = null;
  qId.value = "";
  choose();
  message.value = "นัดทบทวน " + new Date(r.dueAt).toLocaleString("th-TH");
}
</script>
<template>
  <p class="eyebrow dark">ACTIVE RECALL</p>
  <h1>ฝึกดึงความจำ</h1>
  <section v-if="q" class="card">
    <span class="pill"
      >{{ data.topics.find((t: any) => t.id === q.topicId)?.title }} ·
      {{ q.kind }}</span
    >
    <h2>{{ q.prompt }}</h2>
    <template v-if="shown"
      ><h3>คำตอบของคุณ</h3>
      <p class="excerpt">{{ shown.answer }}</p>
      <h3>แนวคำตอบ</h3>
      <p>{{ shown.key }}</p>
      <blockquote v-if="shown.quote">
        {{ shown.quote }}<cite>{{ shown.source }}</cite>
      </blockquote>
      <button
        v-if="!shown.feedback"
        class="light"
        :disabled="busy || !health.ai"
        @click="run(tutor)"
      >
        ให้ AI ประเมินคำอธิบาย
      </button>
      <p v-if="busy">กำลังประมวลผล…</p>
      <section v-if="shown.feedback">
        <h3>ผลประเมิน AI · {{ Math.round(shown.feedback.score * 100) }}%</h3>
        <div v-for="c in shown.feedback.claims" class="entry">
          <b>{{
            c.verdict === "supported"
              ? "ตรงกับหลักฐาน"
              : c.verdict === "incorrect"
                ? "ขัดกับหลักฐาน"
                : "ยังพิสูจน์ไม่ได้"
          }}</b>
          <p>{{ c.point }}</p>
          <blockquote v-if="c.evidence">{{ c.evidence }}</blockquote>
        </div>
        <p>{{ shown.feedback.nextStep }}</p>
      </section>
      <h3>ประเมินความจำของคุณ</h3>
      <div class="actions">
        <button
          v-for="(label, i) in [
            'Again · จำไม่ได้',
            'Hard · จำได้บางส่วน',
            'Good · จำได้',
            'Easy · คล่อง',
          ]"
          :disabled="busy"
          @click="run(() => rate(i + 1))"
        >
          {{ label }}
        </button>
      </div></template
    >
    <button v-else-if="pending" @click="run(() => reveal(pending.id))">
      เปิดแนวคำตอบ
    </button>
    <form v-else @submit.prevent="run(submit)">
      <label
        >ตอบด้วยคำของคุณเอง<textarea
          v-model="draft.answer"
          @input="save"
          maxlength="12000"
          required
        ></textarea></label
      ><label
        >ความมั่นใจ<select v-model="draft.confidence" @change="save">
          <option v-for="n in 5" :value="n">{{ n }} / 5</option>
        </select></label
      ><button :disabled="busy">ส่งคำตอบ</button>
      <button class="light" type="button" :disabled="busy" @click="run(hint)">
        ขอคำใบ้
      </button>
      <p>{{ draft.hintText }}</p>
    </form>
  </section>
  <section v-else class="card">
    <h2>คิวฝึกว่างแล้ว</h2>
    <p v-if="questions.length">
      นัดถัดไป {{ new Date(questions[0].dueAt).toLocaleString("th-TH") }}
    </p>
    <p v-else>เพิ่มบทเรียนและสร้างคำถามในห้องเรียนก่อนเริ่มฝึก</p>
  </section>
  <button v-if="active" @click="openTopic(active.topicId)">กลับรอบเรียน</button>
</template>
