<script setup lang="ts">
const {
    data,
    topics,
    topicId,
    goalId,
    api,
    refresh,
    job,
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
  noteKey = () => ["ll-note", data.value.user.id, topicId.value].join(":");
const source = computed(() =>
  sources.value.find((s: any) => s.id === sourceId.value),
);
watch(
  topicId,
  () => {
    notes.value = localStorage.getItem(noteKey()) ?? topic.value?.notes ?? "";
    sourceId.value = sources.value[0]?.id || "";
    sourceTitle.value = body.value = prompt.value = key.value = hint.value = "";
    upload.value = null;
  },
  { immediate: true },
);
watch(sourceId, () => (section.value = 0));
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
  message.value =
    (r.count > 0
      ? `AI เพิ่มคำถามใหม่ ${r.count} ข้อในคิวฝึกแล้ว`
      : "AI ไม่พบคำถามใหม่ในชุดนี้") +
    (r.skipped > 0 ? ` (ข้ามคำถามซ้ำ ${r.skipped} ข้อ)` : "");
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
    <StudyPlanner />
    <div class="columns">
      <section id="lesson-sources" class="card">
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
          <SourceReader
            :key="source.id + ':' + section"
            :source="source"
            :section="section"
            :ai-ready="health.ai"
          />
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
    <QuestionBank />
    <p v-if="busy" role="status">กำลังประมวลผล…</p>
    <p v-if="!health.ai">
      เชื่อมต่อ Ollama หรือหาโมเดลไม่พบ เปิด Ollama ตรวจชื่อด้วย ollama list แล้วโหลดหน้านี้ใหม่
    </p></template
  >
</template>
