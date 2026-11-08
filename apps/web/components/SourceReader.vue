<script setup lang="ts">
type ArtifactKind = "reading_aid" | "mindmap";
type ReaderView = "original" | "reading" | "summary" | "mindmap";
type Block = { kind: "heading" | "bullet" | "paragraph"; text: string };
const props = defineProps<{
  source: { id: string; title: string; chunks: string[] };
  section: number;
  aiReady: boolean;
}>();
const { api, job } = useLoop();
const view = ref<ReaderView>("original");
const fullLesson = ref(false);
const loadingCache = ref(true);
const generating = ref<ArtifactKind | null>(null);
const error = ref("");
const artifacts = reactive<Record<ArtifactKind, any | null>>({
  reading_aid: null,
  mindmap: null,
});

const views: { id: ReaderView; name: string }[] = [
  { id: "original", name: "ต้นฉบับ" },
  { id: "reading", name: "อ่านง่ายด้วย AI" },
  { id: "summary", name: "สรุปสาระสำคัญ" },
  { id: "mindmap", name: "Mind Map" },
];
const selectedKind = computed<ArtifactKind | null>(() =>
  view.value === "reading" || view.value === "summary"
    ? "reading_aid"
    : view.value === "mindmap"
      ? "mindmap"
      : null,
);
const currentText = computed(() =>
  fullLesson.value
    ? props.source.chunks.join("")
    : props.source.chunks[props.section] || "",
);
function formatOriginal(text: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) {
      blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
      paragraph = [];
    }
  };
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const heading = line.match(/^#{1,6}\s+(.+)$/u);
    if (heading) {
      flush();
      blocks.push({ kind: "heading", text: heading[1] });
      continue;
    }
    const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.+)$/u);
    if (bullet) {
      flush();
      blocks.push({ kind: "bullet", text: bullet[1] });
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return blocks;
}
const originalBlocks = computed(() => formatOriginal(currentText.value));
onMounted(async () => {
  try {
    await Promise.all((["reading_aid", "mindmap"] as ArtifactKind[]).map(async (kind) => {
      const result = await api(
        "sources/" + props.source.id + "/artifacts?section=" + props.section + "&kind=" + kind,
      );
      artifacts[kind] = result.payload;
    }));
  } catch (e: any) {
    error.value = e.message || "โหลดผล AI ที่บันทึกไว้ไม่ได้";
  } finally {
    loadingCache.value = false;
  }
});
async function createArtifact(kind: ArtifactKind) {
  if (generating.value || loadingCache.value || !props.aiReady) return;
  generating.value = kind;
  error.value = "";
  try {
    const task = kind === "reading_aid" ? "reading-aid" : "mindmap";
    const result = await job(task, props.source.id, { section: props.section });
    artifacts[kind] = result.payload;
  } catch (e: any) {
    error.value = e.message || "AI สร้างผลลัพธ์ไม่สำเร็จ";
  } finally {
    generating.value = null;
  }
}
</script>

<template>
  <div class="source-reader">
    <div class="reader-tabs" role="tablist" aria-label="รูปแบบอ่านบทเรียน">
      <button
        v-for="tab in views"
        :key="tab.id"
        type="button"
        role="tab"
        :aria-selected="view === tab.id"
        :class="{ selected: view === tab.id }"
        @click="view = tab.id; error = ''"
      >{{ tab.name }}</button>
    </div>
    <div class="reader-panel" role="tabpanel">
      <template v-if="view === 'original'">
        <label class="reader-check">
          <input v-model="fullLesson" type="checkbox" />
          อ่านต้นฉบับทั้งบทเรียน ({{ source.chunks.length }} ส่วน)
        </label>
        <div class="reader-original">
          <template v-for="(block, i) in originalBlocks" :key="i">
            <h3 v-if="block.kind === 'heading'">{{ block.text }}</h3>
            <p v-else-if="block.kind === 'bullet'" class="reader-bullet">{{ block.text }}</p>
            <p v-else>{{ block.text }}</p>
          </template>
        </div>
      </template>
      <template v-else>
        <p v-if="loadingCache">กำลังตรวจผล AI ที่บันทึกไว้…</p>
        <template v-else-if="selectedKind && artifacts[selectedKind]">
          <ReadingAid
            v-if="selectedKind === 'reading_aid'"
            :aid="artifacts.reading_aid"
            :summary-only="view === 'summary'"
          />
          <LessonMindMap v-else :map="artifacts.mindmap" />
          <p class="reader-footnote">เนื้อหานี้สร้างด้วย AI จากส่วนที่ {{ section + 1 }} โปรดตรวจสอบกับต้นฉบับก่อนนำไปใช้อ้างอิง</p>
        </template>
        <div v-else class="reader-empty">
          <h3>{{ view === 'mindmap' ? 'แปลงบทเรียนเป็น Mind Map' : 'ช่วยจัดบทเรียนให้อ่านง่าย' }}</h3>
          <p>
            {{ view === 'mindmap'
              ? 'จัดแนวคิดหลักและประเด็นย่อยเป็นแผนผัง เพื่อมองเห็นความสัมพันธ์'
              : 'สรุปเนื้อหา แบ่งหัวข้อและย่อหน้า พร้อมคำศัพท์และประเด็นสำคัญ' }}
          </p>
          <button
            type="button"
            :disabled="!!generating || !aiReady"
            @click="selectedKind && createArtifact(selectedKind)"
          >{{ generating ? 'AI กำลังประมวลผล…' : 'สร้างด้วย AI' }}</button>
          <p v-if="!aiReady" class="reader-footnote">ยังไม่พบ Ollama หรือโมเดลที่กำหนด แต่ยังอ่านต้นฉบับได้</p>
        </div>
      </template>
      <p v-if="error" class="reader-error" role="alert">{{ error }}</p>
    </div>
  </div>
</template>
