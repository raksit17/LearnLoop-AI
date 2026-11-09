<script setup lang="ts">
const {
  data, goalId, topicId, topics, questions, attempts, active,
  api, job, refresh, openQuestion, openTopic, health, message,
} = useLoop();
const { busy, run } = useAction();
const duration = ref(45);
const preview = ref<any[]>([]);
const aiTips = ref<string[]>([]);
const previewLoading = ref(false);
const previewError = ref("");
const now = ref(Date.now());
const draft = ref("");
const savedNote = ref(false);
const completedHere = ref(false);
let clock: ReturnType<typeof setInterval> | undefined;
let requestVersion = 0;

const currentTopic = computed(() =>
  topics.value.find((t: any) => t.id === topicId.value),
);
const currentSession = computed(() =>
  active.value && active.value.topicId === topicId.value ? active.value : null,
);
const activeElsewhere = computed(() =>
  active.value && active.value.topicId !== topicId.value ? active.value : null,
);
const plan = computed<any[]>(() =>
  currentSession.value?.plan ?? preview.value,
);
const index = computed(() => currentSession.value?.step ?? 0);
const currentPhase = computed(() => currentSession.value?.plan?.[index.value] || null);
const totalMinutes = computed(() =>
  plan.value.reduce((sum: number, p: any) => sum + Number(p.minutes || 0), 0),
);
const progress = computed(() =>
  currentSession.value
    ? Math.round((index.value / Math.max(1, currentSession.value.plan.length)) * 100)
    : 0,
);
const remaining = computed(() => {
  if (!currentPhase.value || !currentSession.value) return "";
  const end = Date.parse(currentSession.value.stepStart) +
    currentPhase.value.minutes * 60_000;
  const seconds = Math.max(0, Math.ceil((end - now.value) / 1000));
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
});
const overdue = computed(() => {
  if (!currentPhase.value || !currentSession.value) return false;
  return Date.parse(currentSession.value.stepStart) +
    currentPhase.value.minutes * 60_000 < now.value;
});
const dueQuestions = computed(() =>
  questions.value.filter((q: any) => new Date(q.dueAt).getTime() <= now.value),
);
const upcoming = computed(() =>
  [...questions.value]
    .filter((q: any) => new Date(q.dueAt).getTime() > now.value)
    .sort((a: any, b: any) => Date.parse(a.dueAt) - Date.parse(b.dueAt)),
);
const practiced = computed(() =>
  new Set(attempts.value.map((a: any) => a.questionId)).size,
);
const lastFinished = computed(() =>
  [...(data.value?.sessions || [])].find((s: any) =>
    s.topicId === topicId.value && s.finished
  ),
);
const noteCount = computed(() =>
  (lastFinished.value?.evidence || []).filter((s: any) => typeof s === "string" && s.trim()).length,
);
const savedNotes = computed(() => currentSession.value?.evidence || []);
const otherTopicLabel = computed(() =>
  topics.value.find((t: any) => t.id === activeElsewhere.value?.topicId)?.title || "หัวข้ออื่น",
);
const strategies = [
  { title: "Spacing", detail: "ใช้ผลตอบคำถามกำหนดวันทบทวน" },
  { title: "Retrieval", detail: "ปิดคำตอบแล้วนึกด้วยตัวเอง" },
  { title: "Interleaving", detail: "สลับโจทย์จากอีกหัวข้อเมื่อมี" },
  { title: "Elaboration", detail: "ถามว่าทำไมและเชื่อมเหตุผล" },
  { title: "Dual Coding", detail: "วาดภาพหรือแผนผังประกอบ" },
  { title: "Rest & Sleep", detail: "พักหลังเรียนและนอนให้พอ" },
  { title: "Desirable Difficulty", detail: "โจทย์ท้าทายพอดี ไม่ฝืนจนไร้พื้นฐาน" },
  { title: "Priming & Mindset", detail: "เรียกพื้นฐานและเรียนรู้จากข้อผิดพลาด" },
];

async function loadPreview() {
  const version = ++requestVersion;
  if (!topicId.value || currentSession.value) return;
  const selected = topicId.value;
  const mins = duration.value;
  previewLoading.value = true;
  previewError.value = "";
  try {
    const result = await api("sessions/preview", { topicId: selected, minutes: mins });
    if (version !== requestVersion) return;
    preview.value = result.plan || [];
  } catch (err: any) {
    if (version === requestVersion)
      previewError.value = err.message || "โหลดแผนการเรียนไม่ได้";
  } finally {
    if (version === requestVersion) previewLoading.value = false;
  }
}
async function suggestWithAI() {
  const id = topicId.value;
  const mins = duration.value;
  const result = await job("planner", id, { minutes: mins });
  if (id !== topicId.value || mins !== duration.value) return;
  aiTips.value = result.instructions;
  message.value = "AI เสนอคำแนะนำเพิ่มเติมแล้ว ตรวจแผนก่อนเริ่มได้เลย";
}
async function start() {
  await api("sessions/start", {
    topicId: topicId.value,
    minutes: duration.value,
    ...(aiTips.value.length === 5 ? { instructions: aiTips.value } : {}),
  });
  completedHere.value = false;
  await refresh();
}
function evidenceAt(step: number) {
  const list = currentSession.value?.evidence;
  return Array.isArray(list) && typeof list[step] === "string" ? list[step] : "";
}
async function saveEvidence() {
  if (!currentSession.value) return;
  await api("sessions/reflection", {
    id: currentSession.value.id,
    step: index.value,
    text: draft.value,
  });
  await refresh();
  savedNote.value = true;
}
async function completeStep() {
  const session = currentSession.value;
  if (!session) return;
  const final = session.step === session.plan.length - 1;
  await saveEvidence();
  await api("sessions/next", { id: session.id, step: session.step });
  await refresh();
  if (final) {
    completedHere.value = true;
    message.value = "จบรอบเรียนแล้ว! ทบทวนจากคิวฝึกตามวันที่ระบบนัดไว้";
  }
}
function openLesson() {
  document.getElementById("lesson-sources")?.scrollIntoView({
    behavior: "smooth", block: "start",
  });
}
function openOtherSession() {
  if (activeElsewhere.value) openTopic(activeElsewhere.value.topicId);
}
function friendlyDate(value: string) {
  return new Date(value).toLocaleString("th-TH", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}
watch([topicId, duration], () => {
  aiTips.value = [];
  completedHere.value = false;
  preview.value = [];
  void loadPreview();
});
watch(() => [currentSession.value?.id, currentSession.value?.step], () => {
  draft.value = evidenceAt(index.value);
  savedNote.value = false;
}, { immediate: true });
onMounted(() => {
  clock = setInterval(() => now.value = Date.now(), 1000);
  void loadPreview();
});
onUnmounted(() => {
  requestVersion++;
  if (clock) clearInterval(clock);
});
</script>

<template>
  <section class="study-planner" aria-labelledby="study-planner-title">
    <div class="study-head">
      <div>
        <p class="study-overline">LEARNING CYCLE · EVIDENCE-BASED PRACTICE</p>
        <h2 id="study-planner-title">วางแผนรอบเรียนอย่างมีเป้าหมาย</h2>
        <p class="study-subtitle">อ่านให้น้อยลงในแบบที่ได้ฝึกมากขึ้น: เรียกคืน · เข้าใจ · ประยุกต์ · ทบทวน</p>
      </div>
      <span class="study-method-count">8 เทคนิคการเรียนรู้</span>
    </div>

    <div class="study-metrics">
      <div><span>พร้อมทบทวน</span><strong>{{ dueQuestions.length }}</strong><small>ข้อในเป้าหมายนี้</small></div>
      <div><span>เคยฝึกแล้ว</span><strong>{{ practiced }}</strong><small>คำถาม</small></div>
      <div><span>โจทย์ทั้งหมด</span><strong>{{ questions.length }}</strong><small>ข้อในคลังคำถาม</small></div>
    </div>

    <div v-if="activeElsewhere" class="study-attention">
      <strong>มีรอบเรียนที่ยังไม่จบ: {{ otherTopicLabel }}</strong>
      <p>ทำรอบที่ค้างอยู่ให้เสร็จก่อน แล้วจึงเริ่มรอบใหม่</p>
      <button class="light" type="button" @click="openOtherSession">กลับไปเรียนต่อ</button>
    </div>

    <template v-if="currentSession">
      <div class="study-session-live">
        <div class="study-session-top">
          <span>กำลังเรียน · ขั้นที่ {{ index + 1 }} จาก {{ plan.length }}</span>
          <strong :class="{ 'study-overtime': overdue }">{{ remaining }} <small>{{ overdue ? "ครบเวลาช่วงนี้แล้ว" : "เหลือในช่วงนี้" }}</small></strong>
        </div>
        <div
          class="study-progress-track" role="progressbar"
          :aria-valuenow="progress" aria-valuemin="0" aria-valuemax="100"
          aria-label="ความคืบหน้ารอบเรียน"
        ><span :style="{ width: progress + '%' }"></span></div>
        <div class="study-live-body" v-if="currentPhase">
          <p class="study-step-index">กิจกรรม {{ index + 1 }} / {{ plan.length }} · {{ currentPhase.strategy || "ฝึกเรียนรู้" }}</p>
          <h3>{{ currentPhase.name }}</h3>
          <p class="study-purpose">{{ currentPhase.purpose || currentPhase.instruction }}</p>
          <div class="study-activity">
            <strong>ลงมือทำตอนนี้</strong>
            <p>{{ currentPhase.instruction }}</p>
            <p v-if="currentPhase.aiTip" class="study-ai-tip">AI แนะนำ: {{ currentPhase.aiTip }}</p>
            <div v-if="currentPhase.questionPrompt" class="study-practice-prompt">
              <span>โจทย์ที่เลือกจากคลังคำถาม</span>
              <p>{{ currentPhase.questionPrompt }}</p>
            </div>
            <div class="study-actions">
              <button v-if="currentPhase.questionId" type="button" @click="openQuestion(currentPhase.questionId)">เปิดโจทย์เพื่อฝึกตอบ</button>
              <button v-if="index === 1" type="button" class="light" @click="openLesson">ไปอ่านบทเรียน</button>
            </div>
          </div>
          <label class="study-reflection">
            <span>หลักฐานการเรียนรู้ของคุณ</span>
            <small>{{ currentPhase.checkpoint || "เขียนสิ่งที่คุณจำได้ หรือจุดที่ยังไม่เข้าใจ" }}</small>
            <textarea v-model="draft" rows="4" maxlength="4000" placeholder="เขียนด้วยคำของตัวเอง ไม่ต้องสมบูรณ์แบบตั้งแต่ครั้งแรก" @input="savedNote = false"></textarea>
          </label>
          <div class="study-actions study-finish-actions">
            <button type="button" class="light" :disabled="busy" @click="run(saveEvidence)">
              {{ savedNote ? "บันทึกแล้ว ✓" : "บันทึกสิ่งที่เรียนรู้" }}
            </button>
            <button type="button" :disabled="busy" @click="run(completeStep)">
              {{ index === plan.length - 1 ? "จบรอบและบันทึกผล" : "เสร็จขั้นนี้ → ขั้นถัดไป" }}
            </button>
          </div>
          <p class="study-tip">ตัวจับเวลาใช้เป็นแนวทาง ไม่จำเป็นต้องฝืนทำให้ทันทุกกิจกรรม</p>
        </div>
      </div>
      <div class="study-mini-path">
        <div
          v-for="(phase, i) in plan" :key="i"
          :class="['study-mini-step', { done: i < index, current: i === index }]"
        >
          <span>{{ i < index ? "✓" : i + 1 }}</span>
          <div><strong>{{ phase.name }}</strong><small>{{ phase.minutes }} นาที</small></div>
        </div>
      </div>
    </template>

    <template v-else>
      <div v-if="completedHere && lastFinished" class="study-completion" role="status">
        <strong>จบรอบเรียนแล้ว</strong>
        <p>คุณบันทึกการเรียนรู้ {{ noteCount }} จาก {{ lastFinished.plan.length }} ช่วงแล้ว ทบทวนความรู้ตามกำหนดด้านล่างได้เลย</p>
        <button v-if="dueQuestions.length" class="light" type="button" @click="openQuestion(dueQuestions[0].id)">
          ฝึกข้อที่ถึงกำหนด
        </button>
      </div>

      <div class="study-setup">
        <div>
          <h3>ออกแบบรอบเรียนของคุณ</h3>
          <p>เวลาในแต่ละช่วงปรับตามระยะเวลาที่เลือก โดยใช้โจทย์จริงในคลังคำถาม</p>
        </div>
        <label>เวลาเรียน
          <select v-model="duration" :disabled="busy">
            <option v-for="n in [20, 30, 45, 60]" :key="n" :value="n">{{ n }} นาที</option>
          </select>
        </label>
      </div>
      <p v-if="previewLoading" class="study-tip">กำลังจัดแผนตามหัวข้อและโจทย์ของคุณ…</p>
      <p v-if="previewError" role="alert" class="reader-error">{{ previewError }}</p>

      <div v-if="plan.length" class="study-phase-grid">
        <article v-for="(phase, i) in plan" :key="i" class="study-phase">
          <div class="study-phase-top">
            <span class="study-phase-index">{{ String(i + 1).padStart(2, "0") }}</span>
            <span class="study-phase-time">{{ phase.minutes }} นาที</span>
          </div>
          <p class="study-phase-method">{{ phase.strategy }}</p>
          <h4>{{ phase.name }}</h4>
          <p>{{ phase.purpose }}</p>
          <div class="study-phase-task">{{ phase.instruction }}</div>
          <div v-if="phase.questionPrompt" class="study-selected-question">
            <strong>โจทย์ที่จะฝึก</strong>
            <p>{{ phase.questionPrompt }}</p>
          </div>
          <p v-if="aiTips[i]" class="study-ai-tip">AI แนะนำ: {{ aiTips[i] }}</p>
        </article>
      </div>

      <div class="study-controls">
        <div>
          <strong>{{ totalMinutes }} นาที · {{ plan.length }} ช่วง</strong>
          <p>ใช้ได้แม้ AI ออฟไลน์ · คำแนะนำจาก AI เป็นตัวเลือกเสริม</p>
        </div>
        <div class="study-actions">
          <button type="button" class="light" :disabled="busy || !health.ai || !plan.length || !!activeElsewhere"
            @click="run(suggestWithAI)">ให้ AI ปรับคำแนะนำ</button>
          <button type="button" :disabled="busy || !plan.length || !!activeElsewhere"
            @click="run(start)">เริ่มรอบเรียน {{ duration }} นาที</button>
        </div>
      </div>
    </template>

    <div class="study-review">
      <div>
        <p class="study-overline">SPACED REPETITION</p>
        <h3>ทวนหลังเรียน ไม่ใช่แค่อ่านจบ</h3>
        <p>หลังตอบคำถาม ให้ประเมิน Again / Hard / Good / Easy ระบบจะจัดวันทบทวนตามผลจริง ไม่ใช้ช่วงเวลาตายตัว</p>
      </div>
      <div class="study-review-side">
        <strong v-if="dueQuestions.length">{{ dueQuestions.length }} ข้อพร้อมทวนวันนี้</strong>
        <strong v-else>ยังไม่มีข้อที่ถึงกำหนด</strong>
        <p v-if="upcoming.length">นัดถัดไป {{ friendlyDate(upcoming[0].dueAt) }}</p>
        <button v-if="dueQuestions.length" type="button" @click="openQuestion(dueQuestions[0].id)">เริ่มทวนตอนนี้</button>
      </div>
    </div>

    <details class="study-strategy-details">
      <summary>8 เทคนิคนี้อยู่ตรงไหนในการเรียนแต่ละรอบ?</summary>
      <div class="study-strategy-grid">
        <div v-for="(item, i) in strategies" :key="item.title">
          <span>{{ String(i + 1).padStart(2, "0") }}</span>
          <strong>{{ item.title }}</strong>
          <p>{{ item.detail }}</p>
        </div>
      </div>
      <p class="study-tip">ไม่มีวิธีเดียวที่เหมาะกับทุกคน ความยากต้องปรับให้พอดีกับความรู้พื้นฐาน และการพักไม่ใช่สิ่งทดแทนการนอน</p>
    </details>
  </section>
</template>
