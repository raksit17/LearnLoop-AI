<script setup lang="ts">
type Aid = {
  title: string;
  summary: string;
  sections: { heading: string; explanation: string; bullets: string[] }[];
  keyPoints: string[];
  glossary: { term: string; meaning: string }[];
};
type CacheItem = { section: number; payload: Aid; createdAt: string };

const props = defineProps<{
  source: { id: string; title: string; chunks: string[] };
  aiReady: boolean;
}>();
const { api, job } = useLoop();
const summaries = ref<Record<number, Aid>>({});
const loaded = ref(false);
const loading = ref(false);
const generating = ref(false);
const current = ref<number | null>(null);
const error = ref("");
const stopRequested = ref(false);
let mounted = true;

const total = computed(() => props.source.chunks.length);
const complete = computed(() =>
  Array.from({ length: total.value }, (_, i) => i)
    .filter(i => summaries.value[i] != null).length,
);
const missing = computed(() => total.value - complete.value);
const percent = computed(() =>
  total.value ? Math.round(complete.value * 100 / total.value) : 0,
);
const allFinished = computed(() => loaded.value && !missing.value);
const sections = computed(() =>
  Array.from({ length: total.value }, (_, i) => ({
    index: i,
    aid: summaries.value[i] || null,
  })),
);

async function loadCache() {
  loading.value = true;
  error.value = "";
  try {
    const result: { kind: string; scope: string; total: number; items: CacheItem[] } =
      await api("sources/" + props.source.id + "/artifacts?kind=reading_aid&scope=all");
    if (!mounted) return;
    if (result.total !== total.value)
      throw Error("จำนวนส่วนเนื้อหาไม่ตรงกับข้อมูลล่าสุด กรุณาเปิดบทเรียนอีกครั้ง");
    const next: Record<number, Aid> = {};
    for (const item of result.items) {
      if (Number.isInteger(item.section) && item.section >= 0 && item.section < total.value)
        next[item.section] = item.payload;
    }
    summaries.value = next;
  } catch (e: any) {
    if (mounted) error.value = e.message || "โหลดสรุปจากฐานข้อมูลไม่สำเร็จ";
  } finally {
    if (mounted) {
      loaded.value = true;
      loading.value = false;
    }
  }
}

async function generate(parts: number[]) {
  if (!mounted || generating.value || !props.aiReady) return;
  generating.value = true;
  stopRequested.value = false;
  error.value = "";
  try {
    for (const section of parts) {
      if (!mounted || stopRequested.value) break;
      if (summaries.value[section]) continue;
      current.value = section;
      // A separate source/section AI job is cached in PostgreSQL.
      // Retry after an interruption skips already completed sections.
      const result = await job("reading-aid", props.source.id, { section });
      if (!mounted) break;
      if (!result.payload) throw Error("AI ไม่ได้ส่งสรุปของส่วนที่ " + (section + 1));
      summaries.value = { ...summaries.value, [section]: result.payload as Aid };
    }
  } catch (e: any) {
    if (mounted) error.value = e.message || "สรุปบทเรียนไม่สำเร็จ สามารถกดทำต่อจากส่วนที่ยังไม่ครบได้";
  } finally {
    current.value = null;
    generating.value = false;
  }
}
function generateAll() {
  void generate(
    Array.from({ length: total.value }, (_, i) => i)
      .filter(i => !summaries.value[i]),
  );
}
onMounted(() => { void loadCache(); });
onUnmounted(() => {
  mounted = false;
  stopRequested.value = true;
});
</script>

<template>
  <section class="whole-summary" aria-label="สรุป AI ครบทุกส่วนของบทเรียน">
    <div class="whole-summary-heading">
      <div>
        <p class="eyebrow dark">COMPLETE LESSON SUMMARY</p>
        <h3>สรุปทั้งบทเรียน: {{ source.title }}</h3>
        <p>สรุปแยกตามลำดับเนื้อหาต้นฉบับทุกส่วน ไม่ข้ามส่วนใด และเก็บผลไว้ให้อ่านซ้ำ</p>
      </div>
      <span class="whole-summary-count" :class="{ finished: allFinished }">
        {{ complete }} / {{ total }} ส่วน
      </span>
    </div>

    <div
      class="whole-summary-progress" role="progressbar"
      aria-label="ความครอบคลุมของสรุปบทเรียน"
      :aria-valuenow="complete" aria-valuemin="0" :aria-valuemax="total"
    ><span :style="{ width: percent + '%' }"></span></div>
    <p class="whole-summary-status" role="status" aria-live="polite">
      <template v-if="loading">กำลังตรวจสรุปที่บันทึกไว้…</template>
      <template v-else-if="allFinished">สรุปครบ {{ total }} ส่วนแล้ว สามารถเปิดอ่านรายละเอียดแต่ละส่วนได้</template>
      <template v-else-if="generating && current !== null">
        กำลังสรุปส่วนที่ {{ current + 1 }} จาก {{ total }} · สำเร็จแล้ว {{ complete }} ส่วน
      </template>
      <template v-else>สรุปแล้ว {{ complete }} ส่วน ยังเหลือ {{ missing }} ส่วน</template>
    </p>

    <div class="whole-summary-actions">
      <button
        v-if="missing > 0" type="button" :disabled="loading || generating || !aiReady"
        @click="generateAll"
      >{{ complete ? 'สรุปส่วนที่เหลือทั้งหมด' : 'สร้างสรุปครบ ' + total + ' ส่วนด้วย AI' }}</button>
      <button
        v-if="generating" type="button" class="light"
        @click="stopRequested = true"
      >หยุดหลังจบส่วนนี้</button>
      <button
        type="button" class="light" :disabled="loading || generating"
        @click="loadCache"
      >ตรวจสรุปที่บันทึกไว้</button>
    </div>
    <p v-if="!aiReady && missing > 0" class="reader-footnote">
      Ollama ยังไม่พร้อม แต่อ่านส่วนที่เคยสรุปไว้ได้ เมื่อเปิด Ollama แล้วจึงสร้างส่วนที่เหลือ
    </p>
    <p v-if="error" class="reader-error" role="alert">{{ error }}</p>

    <nav v-if="complete" class="whole-summary-index" aria-label="สารบัญสรุปบทเรียน">
      <a
        v-for="part in sections.filter(part => part.aid)"
        :key="part.index"
        :href="'#summary-part-' + part.index"
      >{{ part.index + 1 }}. {{ part.aid?.title }}</a>
    </nav>

    <div class="whole-summary-list">
      <article v-for="part in sections" :id="'summary-part-' + part.index"
        :key="part.index" class="whole-summary-part">
        <div class="whole-summary-part-header">
          <span class="whole-summary-number">ส่วนที่ {{ part.index + 1 }} / {{ total }}</span>
          <span class="whole-summary-state">{{ part.aid ? 'สรุปแล้ว ✓' : 'ยังไม่สรุป' }}</span>
        </div>
        <template v-if="part.aid">
          <h4>{{ part.aid.title }}</h4>
          <p class="whole-summary-description">{{ part.aid.summary }}</p>
          <div v-if="part.aid.keyPoints?.length" class="whole-summary-keypoints">
            <strong>ประเด็นสำคัญ</strong>
            <ul>
              <li v-for="(point, i) in part.aid.keyPoints" :key="i">{{ point }}</li>
            </ul>
          </div>
          <details class="whole-summary-details">
            <summary>ดูคำอธิบายเพิ่มเติมและคำศัพท์ของส่วนนี้</summary>
            <ReadingAid :aid="part.aid" />
          </details>
        </template>
        <template v-else>
          <p class="whole-summary-missing">ยังไม่ได้สร้างสรุปของส่วนที่ {{ part.index + 1 }}</p>
          <button
            type="button" class="light"
            :disabled="loading || generating || !aiReady"
            @click="generate([part.index])"
          >สรุปเฉพาะส่วนนี้</button>
        </template>
      </article>
    </div>
    <p class="reader-footnote">
      ข้อความนี้สร้างโดย AI จากแต่ละส่วนของบทเรียนที่คุณนำเข้า อาจมีข้อผิดพลาด ควรตรวจเทียบต้นฉบับ
    </p>
  </section>
</template>
