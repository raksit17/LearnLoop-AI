<script setup lang="ts">
const { data, goalId, topics, questions, attempts, api, openQuestion } = useLoop();

type AnswerPreview = {
  key: string;
  hint: string;
  quote: string;
  source: string | null;
};

const search = ref("");
const topicFilter = ref("all");
const kindFilter = ref("all");
const originFilter = ref("all");
const openId = ref("");
const loadingId = ref("");
const error = ref("");
const answers = ref<Record<string, AnswerPreview>>({});

const labels: Record<string, string> = {
  recall: "ความจำ",
  application: "ประยุกต์",
  explanation: "อธิบาย",
};
const filtered = computed(() => {
  const keyword = search.value.trim().toLocaleLowerCase();
  return questions.value.filter((q: any) => {
    if (topicFilter.value !== "all" && q.topicId !== topicFilter.value) return false;
    if (kindFilter.value !== "all" && q.kind !== kindFilter.value) return false;
    if (originFilter.value === "ai" && !q.sourceId) return false;
    if (originFilter.value === "manual" && q.sourceId) return false;
    return (
      !keyword ||
      q.prompt.toLocaleLowerCase().includes(keyword) ||
      (topics.value.find((t: any) => t.id === q.topicId)?.title || "")
        .toLocaleLowerCase()
        .includes(keyword)
    );
  });
});

function topicName(id: string) {
  return topics.value.find((t: any) => t.id === id)?.title || "ไม่พบหัวข้อ";
}
function sourceName(id: string) {
  return data.value?.sources.find((s: any) => s.id === id)?.title || "แหล่งเรียน";
}
function attempted(id: string) {
  return attempts.value.some((a: any) => a.questionId === id);
}
function reviewDate(date: string) {
  return new Date(date).toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
async function toggleAnswer(id: string) {
  if (openId.value === id) {
    openId.value = "";
    return;
  }
  openId.value = id;
  error.value = "";
  if (answers.value[id]) return;
  loadingId.value = id;
  try {
    const preview = await api("questions/" + encodeURIComponent(id) + "/preview");
    answers.value = { ...answers.value, [id]: preview };
  } catch (e: any) {
    if (openId.value === id) error.value = e.message || "โหลดแนวคำตอบไม่สำเร็จ";
  } finally {
    if (loadingId.value === id) loadingId.value = "";
  }
}
watch(goalId, () => {
  search.value = "";
  topicFilter.value = kindFilter.value = originFilter.value = "all";
  openId.value = "";
  answers.value = {};
  error.value = "";
});
</script>

<template>
  <section class="card question-bank" aria-labelledby="question-bank-title">
    <div class="bank-heading">
      <div>
        <p class="eyebrow dark">QUESTION BANK</p>
        <h2 id="question-bank-title">คลังคำถาม</h2>
        <p>ดูคำถามทั้งหมดในเป้าหมายนี้ เปิดแนวคำตอบ หรือเลือกข้อที่อยากฝึกได้เลย</p>
      </div>
      <span class="bank-total">{{ questions.length }} ข้อทั้งหมด</span>
    </div>

    <div class="bank-filters">
      <label>
        ค้นหาคำถาม
        <input v-model="search" type="search" placeholder="คำถามหรือชื่อหัวข้อ" />
      </label>
      <label>
        หัวข้อ
        <select v-model="topicFilter">
          <option value="all">ทุกหัวข้อ</option>
          <option v-for="t in topics" :key="t.id" :value="t.id">{{ t.title }}</option>
        </select>
      </label>
      <label>
        ประเภท
        <select v-model="kindFilter">
          <option value="all">ทุกประเภท</option>
          <option value="recall">ความจำ</option>
          <option value="application">ประยุกต์</option>
          <option value="explanation">อธิบาย</option>
        </select>
      </label>
      <label>
        ที่มา
        <select v-model="originFilter">
          <option value="all">ทั้งหมด</option>
          <option value="ai">สร้างด้วย AI</option>
          <option value="manual">สร้างเอง</option>
        </select>
      </label>
    </div>

    <p class="bank-results" aria-live="polite">พบ {{ filtered.length }} คำถาม</p>

    <div v-if="filtered.length" class="bank-list">
      <article v-for="q in filtered" :key="q.id" class="bank-item">
        <div class="bank-meta">
          <span class="pill">{{ labels[q.kind] || q.kind }}</span>
          <span class="pill">{{ q.sourceId ? "สร้างด้วย AI" : "สร้างเอง" }}</span>
          <span>{{ topicName(q.topicId) }}</span>
          <span v-if="attempted(q.id)">เคยฝึกแล้ว</span>
        </div>
        <h3>{{ q.prompt }}</h3>
        <p v-if="q.sourceId" class="bank-source">จากบทเรียน: {{ sourceName(q.sourceId) }}</p>
        <p class="bank-due">
          {{ new Date(q.dueAt).getTime() <= Date.now() ? "พร้อมฝึกทบทวน" : "นัดทบทวน " + reviewDate(q.dueAt) }}
        </p>
        <div class="actions bank-actions">
          <button class="light" type="button" :aria-expanded="openId === q.id"
            @click="toggleAnswer(q.id)">
            {{ openId === q.id ? "ซ่อนแนวคำตอบ" : "ดูแนวคำตอบ" }}
          </button>
          <button type="button" @click="openQuestion(q.id)">ฝึกข้อนี้</button>
        </div>
        <div v-if="openId === q.id" class="bank-answer" aria-live="polite">
          <p v-if="loadingId === q.id">กำลังโหลดแนวคำตอบ…</p>
          <p v-else-if="error" role="alert">{{ error }}</p>
          <template v-else-if="answers[q.id]">
            <h4>แนวคำตอบ</h4>
            <p class="excerpt">{{ answers[q.id].key }}</p>
            <template v-if="answers[q.id].hint">
              <h4>คำใบ้</h4>
              <p>{{ answers[q.id].hint }}</p>
            </template>
            <template v-if="answers[q.id].quote">
              <h4>ข้อความอ้างอิง</h4>
              <blockquote>{{ answers[q.id].quote }}<cite v-if="answers[q.id].source">{{ answers[q.id].source }}</cite></blockquote>
            </template>
          </template>
        </div>
      </article>
    </div>
    <p v-else-if="questions.length" class="bank-empty">ไม่พบคำถามที่ตรงกับตัวกรอง ลองปรับคำค้นหาหรือตัวกรองใหม่</p>
    <p v-else class="bank-empty">ยังไม่มีคำถาม สร้างจากบทเรียนด้วย AI หรือเพิ่มคำถามเองได้จากส่วนด้านบน</p>
  </section>
</template>
