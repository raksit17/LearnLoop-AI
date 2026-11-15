<script setup>
const props = defineProps({
  topicId: { type: String, default: '' },
  sources: { type: Array, default: () => [] },
});
const emit = defineEmits(['imported']);
const { api } = useLoop();
const sourceId = ref('');
const sourceTitle = ref('');
const lessonText = ref('');
const language = ref('php');
const count = ref(4);
const preview = ref(null);
const units = ref([]);
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const message = ref('');

watch(() => props.topicId, () => {
  sourceId.value = '';
  preview.value = null;
  units.value = [];
});
watch(sourceId, value => {
  preview.value = null;
  units.value = [];
  if (value) sourceTitle.value = props.sources.find(s => s.id === value)?.title || '';
});
function firstTitle(text) {
  return (text.split(/\r?\n/).map(s => s.replace(/^#+\s*/, '').replace(/\*\*/g, '').trim())
    .find(s => s.length > 4) || 'บทเรียน Coding').slice(0, 160);
}
async function readText(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > 90000 || !/\.(md|txt)$/i.test(file.name)) throw Error('รองรับ TXT/MD ไม่เกิน 90 KB');
    const content = await file.text();
    if (content.length > 30000) throw Error('บทเรียนยาวเกิน 30,000 ตัวอักษร กรุณาแบ่งตามบท');
    lessonText.value = content;
    sourceTitle.value = firstTitle(content);
    sourceId.value = '';
    preview.value = null;
  } catch (e) { error.value = e.message; }
  event.target.value = '';
}
function parsePairs(json) {
  let cases;
  try { cases = JSON.parse(json); }
  catch { throw Error('Test Cases ต้องเป็น JSON ที่ถูกต้อง'); }
  if (!Array.isArray(cases) || cases.length !== 3
    || !cases.every(c => Array.isArray(c) && c.length === 2))
    throw Error('แต่ละโจทย์ต้องมี Test Cases 3 คู่ [input, expected]');
  return cases;
}
async function generate() {
  error.value = ''; message.value = '';
  if (!sourceId.value && lessonText.value.trim().length < 100) {
    error.value = 'วางบทเรียนอย่างน้อย 100 ตัวอักษร หรือเลือกแหล่งเรียนจากห้องเรียน';
    return;
  }
  loading.value = true;
  try {
    const draft = await api('coding/lesson/preview', {
      topicId: props.topicId || null, sourceId: sourceId.value || null,
      text: sourceId.value ? '' : lessonText.value,
      language: language.value, count: Number(count.value),
    });
    preview.value = draft;
    units.value = draft.units.map(item => ({
      ...item, casesText: JSON.stringify(item.cases, null, 2),
    }));
    if (!sourceTitle.value.trim()) sourceTitle.value = sourceId.value
      ? props.sources.find(s => s.id === sourceId.value)?.title || draft.title
      : firstTitle(lessonText.value);
    message.value = 'AI สร้างชุดฝึกฉบับร่างแล้ว ตรวจบทเรียนย่อยและ Test Cases ก่อนบันทึก';
  } catch (e) { error.value = e.message || 'สร้างโจทย์ไม่สำเร็จ'; }
  finally { loading.value = false; }
}
async function saveAll() {
  if (!preview.value || saving.value) return;
  error.value = ''; message.value = '';
  saving.value = true;
  try {
    const clean = units.value.map(item => ({
      title: item.title.trim(), lesson: item.lesson.trim(), prompt: item.prompt.trim(),
      hint: item.hint.trim(), example: item.example.trim(),
      skill: language.value === 'php' ? 'custom' : item.skill,
      level: Number(item.level), cases: parsePairs(item.casesText),
    }));
    const saved = await api('coding/lesson/import', {
      topicId: props.topicId || null, sourceId: sourceId.value || null,
      sourceTitle: sourceTitle.value.trim() || preview.value.title,
      sourceText: sourceId.value ? '' : lessonText.value,
      language: language.value, units: clean,
    });
    message.value = 'บันทึกโจทย์ ' + saved.created.length + ' ข้อ'
      + (saved.skipped ? ' · ข้ามชื่อซ้ำ ' + saved.skipped : '')
      + (saved.sourceCreated ? ' · นำเข้าบทเรียนในห้องเรียนแล้ว' : '');
    preview.value = null;
    units.value = [];
    emit('imported', saved);
  } catch (e) { error.value = e.message || 'บันทึกไม่สำเร็จ'; }
  finally { saving.value = false; }
}
</script>

<template>
  <section class="lesson-generator">
    <h3>สร้างชุดฝึก Coding จากบทเรียนอัตโนมัติ</h3>
    <p>วางเนื้อหาบทเรียน เช่น <strong>บทที่ 1 — PHP Fundamentals</strong> หรือเลือกแหล่งเรียนจากห้องเรียน ระบบจะสร้างบทเรียนย่อยพร้อมโจทย์เขียนโค้ดและ Test Cases ให้ตรวจแก้ก่อนบันทึก</p>
    <div class="inputs">
      <label v-if="topicId && sources.length">เลือกแหล่งเรียนเดิม
        <select v-model="sourceId">
          <option value="">วางบทเรียนใหม่ด้านล่าง</option>
          <option v-for="source in sources" :key="source.id" :value="source.id">{{ source.title }}</option>
        </select>
      </label>
      <template v-if="!sourceId">
        <label>วางบทเรียนเต็ม (ข้อความ / Markdown)
          <textarea v-model="lessonText" rows="8" maxlength="30000" placeholder="# บทที่ 1 — PHP Fundamentals&#10;Variables, Conditions, Arrays, Loops, Functions, OOP ..." />
        </label>
        <label>หรือเลือกไฟล์ TXT / Markdown
          <input type="file" accept=".txt,.md,text/plain,text/markdown" @change="readText" />
        </label>
      </template>
      <label>ชื่อแหล่งเรียน
        <input v-model="sourceTitle" maxlength="160" placeholder="บทที่ 1 — PHP Fundamentals" />
      </label>
      <div class="two-col">
        <label>ภาษาที่ต้องการฝึก
          <select v-model="language" :disabled="loading">
            <option value="php">PHP 8+</option>
            <option value="javascript">JavaScript</option>
          </select>
        </label>
        <label>จำนวนโจทย์
          <select v-model.number="count" :disabled="loading">
            <option :value="3">3 โจทย์</option>
            <option :value="4">4 โจทย์</option>
          </select>
        </label>
      </div>
      <button type="button" :disabled="loading || saving" @click="generate">
        {{ loading ? 'AI กำลังแยกบทเรียนและสร้างโจทย์...' : 'สร้างบทเรียนย่อย + Coding Challenges ด้วย AI' }}
      </button>
      <small>ใช้ Ollama ในเครื่อง AI อาจสร้างโจทย์หรือผลลัพธ์ผิด ควรตรวจทุก Test Case ก่อนบันทึก ระบบยังไม่บันทึกจนกว่าจะกดยืนยัน</small>
    </div>
    <section v-if="preview" class="preview">
      <h3>ตัวอย่างชุดฝึก: {{ preview.title }}</h3>
      <p>{{ preview.overview }}</p>
      <div v-for="(unit,index) in units" :key="index" class="unit">
        <h4>โจทย์ที่ {{ index + 1 }} / {{ units.length }}</h4>
        <label>ชื่อบทเรียนย่อย / โจทย์
          <input v-model="unit.title" maxlength="160" />
        </label>
        <label>เนื้อหาที่ AI สอนก่อนเริ่มเขียน
          <textarea v-model="unit.lesson" rows="5" maxlength="3500" />
        </label>
        <label>โจทย์และเงื่อนไข
          <textarea v-model="unit.prompt" rows="4" maxlength="8000" />
        </label>
        <label>ตัวอย่าง Input → Output
          <input v-model="unit.example" maxlength="1200" />
        </label>
        <label>คำใบ้
          <textarea v-model="unit.hint" rows="2" maxlength="1500" />
        </label>
        <label>Test Cases 3 คู่ (JSON)
          <textarea v-model="unit.casesText" rows="6" class="code-input" />
        </label>
      </div>
      <button type="button" :disabled="loading || saving" @click="saveAll">
        {{ saving ? 'กำลังบันทึก...' : 'ยืนยันและบันทึกชุดฝึกทั้งหมดลง LearnLoop' }}
      </button>
    </section>
    <p v-if="message" role="status">{{ message }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.lesson-generator { display: grid; gap: 1rem; padding: 1.1rem; border: 1px solid var(--border,#d1d5db); border-radius: .85rem; }
.inputs, .preview, .unit { display: grid; gap: .8rem; }
.two-col { display: grid; grid-template-columns: repeat(auto-fit,minmax(11rem,1fr)); gap: .8rem; }
label { display: grid; gap: .35rem; }
input,select,textarea { width: 100%; }
.code-input { font-family: ui-monospace,monospace; }
.preview { border-top: 1px solid var(--border,#d1d5db); padding-top: .8rem; }
.unit { padding: 1rem; border-radius: .7rem; background: var(--surface,#f8fafc); border: 1px solid var(--border,#d1d5db); }
</style>
