<script setup lang="ts">
const {
    data,
    topics,
    topicId,
    goalId,
    active,
    api,
    refresh,
    job,
    openQuestion,
    health,
    message,
  } = useLoop(),
  { busy, run } = useAction();
const topic = computed(() =>
    topics.value.find((t: any) => t.id === topicId.value),
  ),
  sources = computed(() =>
    data.value.sources.filter((s: any) => s.topicId === topicId.value),
  );
const newTitle = ref(""),
  notes = ref(""),
  sourceTitle = ref(""),
  body = ref(""),
  upload = ref<File | null>(null),
  sourceId = ref(""),
  section = ref(0),
  prompt = ref(""),
  key = ref(""),
  hint = ref(""),
  kind = ref("recall"),
  duration = ref(30),
  instructions = ref<string[]>([]),
  noteKey = () => ["ll-note", data.value.user.id, topicId.value].join(":");
const source = computed(() =>
  sources.value.find((s: any) => s.id === sourceId.value),
);
watch(
  topicId,
  () => {
    notes.value = localStorage.getItem(noteKey()) ?? topic.value?.notes ?? "";
    sourceId.value = sources.value[0]?.id || "";
    instructions.value = [];
    sourceTitle.value = body.value = prompt.value = key.value = hint.value = "";
    upload.value = null;
  },
  { immediate: true },
);
watch(sourceId, () => (section.value = 0));
watch(duration, () => (instructions.value = []));
const now = ref(Date.now());
let timer: any;
onMounted(() => (timer = setInterval(() => (now.value = Date.now()), 1000)));
onUnmounted(() => clearInterval(timer));
const session = computed(() =>
    active.value?.topicId === topicId.value ? active.value : null,
  ),
  step = computed(() => session.value?.plan[session.value.step]);
const remaining = computed(() => {
  if (!step.value) return "";
  const secs = Math.max(
    0,
    Math.ceil(
      (Date.parse(session.value.stepStart) +
        step.value.minutes * 60000 -
        now.value) /
        1000,
    ),
  );
  return Math.floor(secs / 60) + ":" + String(secs % 60).padStart(2, "0");
});
function localStorageSafe(e: Event) {
  localStorage.setItem(noteKey(), (e.target as HTMLTextAreaElement).value);
}
function addTopic() {
  run(async () => {
    const t = await api("topics", {
      goalId: goalId.value,
      title: newTitle.value,
    });
    newTitle.value = "";
    await refresh();
    topicId.value = t.id;
  });
}
function saveNotes() {
  run(async () => {
    await api("notes", { topicId: topicId.value, notes: notes.value });
    localStorage.removeItem(noteKey());
    await refresh();
    message.value = "บันทึกลงสมุดแล้ว";
  });
}
async function importSource() {
  let s;
  const t = topicId.value;
  if (upload.value && /\.pdf$/i.test(upload.value.name)) {
    const f = new FormData();
    f.set("topicId", t);
    f.set("title", sourceTitle.value || upload.value.name);
    f.set("file", upload.value);
    s = await api("sources/pdf", f);
  } else {
    s = await api("sources", {
      topicId: t,
      title: sourceTitle.value || upload.value?.name,
      body: upload.value ? await upload.value.text() : body.value,
    });
  }
  await refresh();
  sourceId.value = s.id;
  body.value = sourceTitle.value = "";
  upload.value = null;
  message.value = "เพิ่มแหล่งเรียนแล้ว";
}
function pickFile(e: Event) {
  upload.value = (e.target as HTMLInputElement).files?.[0] || null;
}
function addQuestion() {
  run(async () => {
    await api("questions", {
      topicId: topicId.value,
      prompt: prompt.value,
      key: key.value,
      hint: hint.value,
      kind: kind.value,
    });
    prompt.value = key.value = hint.value = "";
    await refresh();
    message.value = "เพิ่มคำถามเข้าคิวฝึกแล้ว";
  });
}
async function generate() {
  const r = await job("generate", sourceId.value, { section: section.value });
  await refresh();
  message.value = "AI เพิ่มคำถาม " + r.count + " ข้อในคิวฝึกแล้ว";
}
async function planner() {
  const t = topicId.value,
    m = duration.value;
  const r = await job("planner", t, { minutes: m });
  if (t === topicId.value && m === duration.value)
    instructions.value = r.instructions;
}
async function start() {
  await api("sessions/start", {
    topicId: topicId.value,
    minutes: duration.value,
    instructions: instructions.value.length ? instructions.value : undefined,
  });
  await refresh();
}
</script>
<template>
  <p class="eyebrow dark">LEARNING WORKSPACE</p>
  <h1>ห้องเรียน</h1>
  <form class="card inline" @submit.prevent="addTopic">
    <label>หัวข้อใหม่<input v-model="newTitle" required /></label
    ><button :disabled="busy">เพิ่มหัวข้อ</button>
  </form>
  <template v-if="topic"
    ><label
      >กำลังเรียน<select v-model="topicId" :disabled="busy">
        <option v-for="t in topics" :value="t.id">{{ t.title }}</option>
      </select></label
    >
    <section v-if="session" class="hero">
      <p class="eyebrow">STUDY SESSION · {{ session.step + 1 }} / 5</p>
      <h2>{{ step.name }} · {{ remaining }}</h2>
      <p>{{ step.instruction }}</p>
      <button v-if="step.questionId" @click="openQuestion(step.questionId)">
        เปิดโจทย์
      </button>
      <button
        :disabled="busy"
        @click="
          run(async () => {
            await api('sessions/next', { id: session.id, step: session.step });
            await refresh();
          })
        "
      >
        {{ session.step === 4 ? "จบรอบเรียน" : "เสร็จขั้นตอนนี้" }}
      </button>
    </section>
    <div class="columns">
      <section class="card">
        <h2>แหล่งเรียน</h2>
        <details>
          <summary>+ นำเข้าบทเรียน</summary>
          <form @submit.prevent="run(importSource)">
            <label
              >ชื่อแหล่งเรียน<input
                v-model="sourceTitle"
                :required="!upload" /></label
            ><label
              >ข้อความ / Transcript<textarea
                v-model="body"
                :required="!upload"
              ></textarea></label
            ><label
              >หรือเลือกไฟล์ PDF, TXT, MD<input
                type="file"
                accept=".pdf,.txt,.md"
                @change="pickFile" /></label
            ><button :disabled="busy">นำเข้า</button>
          </form>
        </details>
        <label v-if="sources.length"
          >บทเรียน<select v-model="sourceId" :disabled="busy">
            <option v-for="s in sources" :value="s.id">{{ s.title }}</option>
          </select></label
        ><template v-if="source"
          ><label
            >ส่วนเนื้อหา<select v-model="section" :disabled="busy">
              <option v-for="(_, i) in source.chunks" :value="i">
                ส่วนที่ {{ Number(i) + 1 }}
              </option>
            </select></label
          >
          <article class="excerpt">{{ source.chunks[section] }}</article>
          <button :disabled="busy || !health.ai" @click="run(generate)">
            สร้าง 3 คำถามด้วย AI</button
          ><small>ใช้เฉพาะข้อความส่วนที่เลือก</small></template
        >
        <p v-else>เพิ่มบทเรียนเพื่อใช้อ้างอิงในการสร้างคำถาม</p>
      </section>
      <section class="card">
        <h2>บันทึกของฉัน</h2>
        <textarea
          aria-label="บันทึก"
          v-model="notes"
          @input="localStorageSafe"
        ></textarea
        ><button :disabled="busy" @click="saveNotes">บันทึกลงสมุด</button>
        <details>
          <summary>+ สร้างคำถามเอง</summary>
          <form @submit.prevent="addQuestion">
            <label>คำถาม<textarea v-model="prompt" required></textarea></label
            ><label>แนวคำตอบ<textarea v-model="key" required></textarea></label
            ><label>คำใบ้<input v-model="hint" /></label
            ><label
              >ทักษะ<select v-model="kind">
                <option value="recall">ความจำ</option>
                <option value="application">ประยุกต์</option>
                <option value="explanation">อธิบาย</option>
              </select></label
            ><button :disabled="busy">เพิ่มคำถาม</button>
          </form>
        </details>
      </section>
    </div>
    <section class="card" v-if="!active">
      <h2>วางแผนรอบเรียน</h2>
      <label
        >เวลาเรียน<select v-model="duration" :disabled="busy">
          <option v-for="n in [20, 30, 45, 60]" :value="n">{{ n }} นาที</option>
        </select></label
      ><button
        class="light"
        :disabled="busy || !health.ai"
        @click="run(planner)"
      >
        ให้ AI ออกแบบกิจกรรม
      </button>
      <button :disabled="busy" @click="run(start)">เริ่มรอบเรียน</button>
      <ol v-if="instructions.length">
        <li v-for="s in instructions">{{ s }}</li>
      </ol>
    </section>
    <p v-if="busy" role="status">กำลังประมวลผล…</p>
    <p v-if="!health.ai">
      เชื่อมต่อ Ollama หรือหาโมเดลไม่พบ เปิด Ollama ตรวจชื่อด้วย ollama list แล้วโหลดหน้านี้ใหม่
    </p></template
  >
</template>
