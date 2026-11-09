<script setup lang="ts">
type LearningMode = "reading" | "summary" | "mindmap";
type ArtifactKind = "reading_aid" | "mindmap";
type CachedArtifact = { section: number; payload: any; createdAt: string };

const props = defineProps<{
  source: { id: string; title: string; chunks: string[] };
  aiReady: boolean;
  mode: LearningMode;
}>();
const { api, job } = useLoop();
const results = ref<Record<number, any>>({});
const loading = ref(true);
const loaded = ref(false);
const generating = ref(false);
const processing = ref<number | null>(null);
const error = ref("");
const stopRequested = ref(false);
let mounted = true;

const total = computed(() => props.source.chunks.length);
const kind = computed<ArtifactKind>(() =>
  props.mode === "mindmap" ? "mindmap" : "reading_aid",
);
const task = computed(() =>
  kind.value === "mindmap" ? "mindmap" : "reading-aid",
);
const label = computed(() =>
  props.mode === "reading" ? "อ่านง่ายด้วย AI" :
    props.mode === "mindmap" ? "Mind Map" : "สรุปสาระสำคัญ",
);
const count = computed(() =>
  Array.from({ length: total.value }, (_, i) => i)
    .filter(i => results.value[i] != null).length,
);
const missing = computed(() => total.value - count.value);
const percent = computed(() => total.value ? Math.round(count.value / total.value * 100) : 0);
const sections = computed(() =>
  Array.from({ length: total.value }, (_, index) => ({
    index,
    payload: results.value[index] ?? null,
  })),
);
const complete = computed(() => loaded.value && missing.value === 0);

async function loadCache() {
  if (generating.value) return;
  loading.value = true;
  error.value = "";
  try {
    const path =
      "sources/" + encodeURIComponent(props.source.id) +
      "/artifacts?scope=all&kind=" + kind.value;
    const response: { total: number; items: CachedArtifact[] } = await api(path);
    if (!mounted) return;
    if (response.total !== total.value) throw Error("ข้อมูลบทเรียนเปลี่ยน กรุณาเปิดบทเรียนอีกครั้ง");
    const next: Record<number, any> = {};
    for (const item of response.items) {
      if (Number.isInteger(item.section) && item.section >= 0 && item.section < total.value)
        next[item.section] = item.payload;
    }
    results.value = next;
  } catch (e: any) {
    if (mounted) error.value = e.message || "ไม่สามารถโหลดข้อมูลที่บันทึกไว้";
  } finally {
    if (mounted) {
      loaded.value = true;
      loading.value = false;
    }
  }
}

async function generate(parts: number[]) {
  if (!mounted || generating.value || loading.value || !props.aiReady) return;
  generating.value = true;
  stopRequested.value = false;
  error.value = "";
  try {
    for (const section of parts) {
      if (!mounted || stopRequested.value) break;
      if (results.value[section]) continue;
      processing.value = section;
      // Each AI job reads one source chunk. The worker caches it per
      // sourceId/section/kind, avoiding overly long prompts and duplicate work.
      const output = await job(task.value, props.source.id, { section });
      if (!mounted) break;
      if (!output?.payload) throw Error("ไม่ได้รับผล AI สำหรับส่วนที่ " + (section + 1));
      results.value = { ...results.value, [section]: output.payload };
    }
  } catch (e: any) {
    if (mounted) error.value = (e.message || "AI สร้างผลไม่สำเร็จ") +
      " · ส่วนที่ทำเสร็จแล้วจะถูกเก็บไว้ สามารถสร้างต่อได้";
  } finally {
    processing.value = null;
    generating.value = false;
  }
}

function generateMissing() {
  void generate(sections.value.filter(part => !part.payload).map(part => part.index));
}

onMounted(() => { void loadCache(); });
onUnmounted(() => {
  mounted = false;
  stopRequested.value = true;
});
</script>

<template>
  <section class="whole-summary" :aria-label="label + ' ครบทุกส่วนของบทเรียน'">
    <div class="whole-summary-heading">
      <div>
        <p class="eyebrow dark">COMPLETE LESSON · {{ mode === "mindmap" ? "MIND MAP" : mode === "reading" ? "READ EASY" : "SUMMARY" }}</p>
        <h3>{{ label }}ทั้งบทเรียน: {{ source.title }}</h3>
        <p v-if="mode === 'mindmap'">
          แสดง Mind Map แยกตามทุกส่วนของบทเรียนเพื่อให้มองเห็นแนวคิดครบตามต้นฉบับ
        </p>
        <p v-else-if="mode === 'reading'">
          อ่านคำอธิบายที่จัดใหม่ หัวข้อสำคัญ และคำศัพท์ครบทุกส่วนของบทเรียน
        </p>
        <p v-else>
          สรุปสาระสำคัญทุกส่วนตามลำดับเนื้อหาต้นฉบับ ไม่ข้ามส่วนที่ยังไม่ได้ทำ
        </p>
      </div>
      <span class="whole-summary-count" :class="{ finished: complete }">
        {{ count }} / {{ total }} ส่วน
      </span>
    </div>
    <div
      class="whole-summary-progress"
      role="progressbar"
      :aria-label="'ความคืบหน้า' + label"
      :aria-valuenow="count"
      aria-valuemin="0"
      :aria-valuemax="total"
    ><span :style="{ width: percent + '%' }"></span></div>
    <p class="whole-summary-status" role="status" aria-live="polite">
      <template v-if="loading">กำลังโหลดผล AI ที่บันทึกไว้…</template>
      <template v-else-if="generating && processing !== null">
        กำลังทำส่วนที่ {{ processing + 1 }} จาก {{ total }} · เสร็จแล้ว {{ count }} ส่วน
      </template>
      <template v-else-if="complete">{{ label }}ครบ {{ total }} ส่วนแล้ว</template>
      <template v-else>ทำแล้ว {{ count }} ส่วน · ยังเหลือ {{ missing }} ส่วน</template>
    </p>
    <div class="whole-summary-actions">
      <button v-if="missing > 0" type="button"
        :disabled="loading || generating || !aiReady"
        @click="generateMissing">
        {{ count ? "ทำส่วนที่เหลือทั้งหมด" : "สร้าง" + label + "ครบ " + total + " ส่วน" }}
      </button>
      <button v-if="generating" type="button" class="light"
        @click="stopRequested = true">หยุดหลังจบส่วนนี้</button>
      <button type="button" class="light" :disabled="loading || generating"
        @click="loadCache">ตรวจผลที่บันทึกไว้</button>
    </div>
    <p v-if="!aiReady && missing > 0" class="reader-footnote">
      Ollama ยังไม่พร้อม สามารถอ่านส่วนที่เคยบันทึกไว้ก่อน แล้วทำส่วนที่เหลือเมื่อ AI พร้อม
    </p>
    <p v-if="error" role="alert" class="reader-error">{{ error }}</p>

    <nav v-if="count" class="whole-summary-index" :aria-label="'สารบัญ' + label">
      <a v-for="part in sections.filter(s => s.payload)" :key="part.index"
        :href="'#' + mode + '-part-' + part.index">
        {{ part.index + 1 }}. {{ part.payload?.title || part.payload?.root || "ส่วนที่ " + (part.index + 1) }}
      </a>
    </nav>

    <div class="whole-summary-list">
      <article v-for="part in sections"
        :id="mode + '-part-' + part.index"
        :key="part.index"
        class="whole-summary-part">
        <div class="whole-summary-part-header">
          <span class="whole-summary-number">ส่วนที่ {{ part.index + 1 }} / {{ total }}</span>
          <span class="whole-summary-state">{{ part.payload ? "สร้างแล้ว ✓" : "ยังไม่สร้าง" }}</span>
        </div>
        <template v-if="part.payload">
          <ReadingAid v-if="mode === 'reading'" :aid="part.payload" />
          <LessonMindMap v-else-if="mode === 'mindmap'" :map="part.payload" />
          <template v-else>
            <h4>{{ part.payload.title }}</h4>
            <p class="whole-summary-description">{{ part.payload.summary }}</p>
            <div v-if="part.payload.keyPoints?.length" class="whole-summary-keypoints">
              <strong>ประเด็นสำคัญ</strong>
              <ul>
                <li v-for="(point, i) in part.payload.keyPoints" :key="i">{{ point }}</li>
              </ul>
            </div>
            <details class="whole-summary-details">
              <summary>เปิดอ่านคำอธิบายและคำศัพท์เพิ่มเติม</summary>
              <ReadingAid :aid="part.payload" />
            </details>
          </template>
        </template>
        <template v-else>
          <p class="whole-summary-missing">ส่วนที่ {{ part.index + 1 }} ยังไม่มี{{ label }}</p>
          <button type="button" class="light"
            :disabled="loading || generating || !aiReady"
            @click="generate([part.index])">สร้างเฉพาะส่วนนี้</button>
        </template>
      </article>
    </div>
    <p class="reader-footnote">
      ผลลัพธ์นี้สร้างโดย AI จากแต่ละส่วนของบทเรียน ควรตรวจสอบกับต้นฉบับก่อนใช้อ้างอิง
    </p>
  </section>
</template>
