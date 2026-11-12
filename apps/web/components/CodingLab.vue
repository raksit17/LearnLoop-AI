<script setup>
import { exercises, starter, validReport, editorUrl } from '../utils/codingLab.mjs';

const props = defineProps({ learner: { type: String, required: true } });
const selected = ref(exercises[0].id);
const exercise = computed(() => exercises.find(item => item.id === selected.value));
const blank = () => ({ prediction: '', explanation: '', attempt: '', passed: null, due: 0 });
const records = reactive(Object.fromEntries(exercises.map(item => [item.id, blank()])));
const draft = computed(() => records[selected.value]);
const path = ref('');
const notice = ref('');
const { api } = useLoop();
const downloading = ref(false);
const history = ref([]);
const syncError = ref('');
let requestVersion = 0;
let timer;
async function refreshHistory() {
  const version = ++requestVersion;
  const id = selected.value;
  try {
    const rows = await api('coding/history/' + id);
    if (version !== requestVersion) return;
    history.value = rows;
    syncError.value = '';
    const record = records[id];
    const current = rows.find(row => row.fileId === record.attempt);
    if (current) record.passed = current.passed;
  } catch (error) {
    if (version === requestVersion) syncError.value = error.message;
  }
}
onMounted(() => {
  refreshHistory();
  timer = setInterval(() => { if (!document.hidden) refreshHistory(); }, 5000);
});
onBeforeUnmount(() => { ++requestVersion; clearInterval(timer); });
const storageKey = 'learnloop:coding:v1:' + props.learner;
const link = computed(() => editorUrl(path.value, selected.value));

onMounted(() => {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    for (const item of exercises) Object.assign(records[item.id], saved?.[item.id]);
  } catch { notice.value = 'อ่านประวัติจากเบราว์เซอร์ไม่ได้'; }
  watch(records, () => {
    try { localStorage.setItem(storageKey, JSON.stringify(records)); }
    catch { notice.value = 'บันทึกความคืบหน้าในเบราว์เซอร์ไม่ได้'; }
  }, { deep: true });
});
watch(selected, () => { path.value = ''; notice.value = ''; history.value = []; syncError.value = ''; refreshHistory(); });
async function download() {
  if (downloading.value) return;
  downloading.value = true;
  const item = exercise.value;
  try {
    const file = await api('coding/files', { exercise: item.id });
    records[item.id].attempt = file.attempt;
    records[item.id].passed = null;
    const script = starter(item, file.attempt, { url: location.origin + '/v1/coding/submit', token: file.token });
    const url = URL.createObjectURL(new Blob([script], { type: 'text/javascript' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = item.id + '.mjs';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { notice.value = error.message; }
  finally { downloading.value = false; }
}
async function readReport(event) {
  const input = event.target;
  const file = input.files?.[0];
  if (!file) return;
  const item = exercise.value;
  const record = draft.value;
  try {
    if (file.size > 512000) throw new Error();
    const report = JSON.parse(await file.text());
    if (!validReport(report, item, record.attempt)) throw new Error();
    record.passed = report.passed;
    notice.value = report.passed === report.total ? 'ผ่านครบแล้ว ลองอธิบายแนวคิดด้วยคำของคุณเอง' : 'ดูกรณีที่ผิดใน Terminal แก้โค้ดแล้วรันซ้ำได้';
  } catch { notice.value = 'เลือกไฟล์ผล JSON ของโจทย์และรอบปัจจุบัน'; }
  input.value = '';
}
function schedule(days) {
  draft.value.due = Date.now() + days * 86400000;
}
function restart() {
  Object.assign(draft.value, blank());
  path.value = '';
  notice.value = '';
}
</script>

<template>
  <section class="coding">
    <h1>ฝึกเขียนโค้ด</h1>
    <label>เลือกโจทย์ JavaScript
      <select v-model="selected">
        <option v-for="item in exercises" :key="item.id" :value="item.id">
          {{ item.title }}{{ records[item.id].due && records[item.id].due <= Date.now() ? ' · ถึงเวลาทบทวน' : '' }}
        </option>
      </select>
    </label>
    <section class="card">
      <h2>{{ exercise.title }}</h2>
      <p>{{ exercise.prompt }}</p><pre>{{ exercise.example }}</pre>
      <label>ก่อนเปิดตัวแก้ไข ลองเขียนขั้นตอนจากความจำและคิดกรณีขอบหนึ่งกรณี
        <textarea v-model="draft.prediction" rows="3" />
      </label>
      <details :key="selected"><summary>ขอคำใบ้</summary><p>{{ exercise.hint }}</p></details>
    </section>
    <section class="card">
      <h2>ลงมือทำใน VS Code</h2>
      <button :disabled="downloading" @click="download">ดาวน์โหลด {{ selected }}.mjs</button>
      <p>เปิดไฟล์ด้วย VS Code หรือวางพาธเต็มของไฟล์ที่ดาวน์โหลดเพื่อเปิดจากหน้านี้</p>
      <label>พาธไฟล์ในเครื่อง<input v-model="path" :placeholder="'C:/Downloads/' + selected + '.mjs'" /></label>
      <a v-if="link" :href="link">เปิดไฟล์ใน VS Code</a>
      <small v-else-if="path">พาธต้องลงท้ายด้วย /{{ selected }}.mjs</small>
      <p>เขียนฟังก์ชัน solve แล้วบันทึก เปิด Terminal ในโฟลเดอร์เดียวกับไฟล์ ใช้ Node.js 22 รันคำสั่ง</p>
      <pre>node {{ selected }}.mjs</pre>
      <p>เมื่อรัน ไฟล์นี้จะส่งโค้ดในส่วนคำตอบและคะแนนเข้าบัญชีของคุณอัตโนมัติ แม้ปิดหน้าเว็บแล้ว ไฟล์โจทย์ผูกกับบัญชีของคุณ ควรแชร์เฉพาะโค้ดคำตอบ</p>
      <details><summary>นำเข้า JSON จากไฟล์โจทย์รุ่นเดิม</summary><label>นำเข้าผล {{ selected }}-result.json จากโฟลเดอร์เดิม
        <input type="file" accept=".json" @change="readReport" />
      </label>
      </details>
      <strong v-if="draft.passed !== null">ผ่าน {{ draft.passed }} / {{ exercise.cases.length }} กรณี</strong>
      <p role="status" v-if="notice">{{ notice }}</p>
    </section>
    <section class="card">
      <h2>คำตอบที่บันทึกใน LearnLoop</h2>
      <p v-if="syncError" role="status">{{ syncError }}</p>
      <p v-else-if="!history.length">ยังไม่มีผลที่ส่งจากโจทย์นี้</p>
      <details v-for="row in history" :key="row.id">
        <summary>{{ new Date(row.createdAt).toLocaleString('th-TH') }} · ผ่าน {{ row.passed }}/{{ row.total }}</summary>
        <pre>{{ row.answer }}</pre>
      </details>
    </section>
    <section class="card">
      <h2>อธิบายและนัดทบทวน</h2>
      <label>ถ้าต้องสอนเพื่อน คุณจะอธิบายวิธีแก้และกรณีขอบอย่างไร?
        <textarea v-model="draft.explanation" rows="3" />
      </label>
      <template v-if="draft.passed !== null && draft.explanation.trim()">
        <button @click="schedule(1)">ยังติดขัด · ทวนพรุ่งนี้</button>
        <button class="light" @click="schedule(3)">อธิบายได้ · ทวนใน 3 วัน</button>
      </template>
      <p v-if="draft.due">ทบทวนวันที่ {{ new Date(draft.due).toLocaleString('th-TH') }}
        <button class="light" @click="restart">เริ่มรอบใหม่จากความจำ</button>
      </p>
      <p>พักสายตาสักครู่ แล้วลองสลับไปฝึกโจทย์อีกประเภท โน้ตและวันทบทวนเก็บในเบราว์เซอร์นี้</p>
    </section>
  </section>
</template>

<style scoped>
.coding { display: grid; gap: 1rem; max-width: 52rem; }
.card { display: grid; gap: .75rem; justify-items: start; }
label, textarea, input, select { width: 100%; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
