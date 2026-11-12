<script setup>
import { exercises as initialExercises, starter, validReport, editorUrl } from '../utils/codingLab.mjs';

const props = defineProps({ learner: { type: String, required: true } });
const exercises = ref(initialExercises);
const plan = ref(null);
const selected = ref(initialExercises[0].id);
const exercise = computed(() => exercises.value.find(item => item.id === selected.value));
const blank = () => ({ prediction: '', explanation: '', attempt: '', passed: null, due: 0 });
const records = reactive(Object.fromEntries(initialExercises.map(item => [item.id, blank()])));
const draft = computed(() => records[selected.value]);
const path = ref('');
const notice = ref('');
const { api } = useLoop();
const downloading = ref(false);
const pairing = ref(null);
const pairingReady = ref(false);
const pairingError = ref('');
const pairLink = computed(() => pairing.value
  ? 'vscode://learnloop.learnloop-codelab/connect?code=' + encodeURIComponent(pairing.value.code)
    + '&base=' + encodeURIComponent(location.origin)
  : '');
const exerciseLink = computed(() =>
  'vscode://learnloop.learnloop-codelab/exercise?id=' + encodeURIComponent(selected.value)
    + '&base=' + encodeURIComponent(typeof location === 'undefined' ? 'http://localhost:4318' : location.origin));
async function pairWithVSCode() {
  pairingError.value = '';
  pairingReady.value = false;
  try { pairing.value = await api('coding/pair/start', {}); }
  catch (error) { pairingError.value = error.message; }
}
async function checkPairing() {
  if (!pairing.value || pairingReady.value) return;
  try {
    const status = await api('coding/pair/status/' + pairing.value.pairingId);
    pairingReady.value = status.connected;
    if (status.expired && !status.connected) pairingError.value = 'รหัสจับคู่หมดอายุ กดเชื่อมต่อใหม่';
  } catch (error) { pairingError.value = error.message; }
}

const history = ref([]);
const syncError = ref('');
let planVersion = 0;
async function onCustomChanged(id) {
  await refreshPlan();
  if (id && exercises.value.some(item => item.id === id)) selected.value = id;
  else if (!exercises.value.some(item => item.id === selected.value))
    selected.value = plan.value?.recommendation || exercises.value[0]?.id || initialExercises[0].id;
}
async function refreshPlan() {
  const version = ++planVersion;
  try {
    const next = await api('coding/plan');
    if (version !== planVersion) return;
    for (const item of next.catalog) records[item.id] ||= blank();
    exercises.value = next.catalog;
    plan.value = next;
  } catch (error) { notice.value = error.message; }
}
let requestVersion = 0;
let timer;
async function refreshHistory() {
  const version = ++requestVersion;
  const id = selected.value;
  try {
    const rows = await api('coding/history/' + id);
    if (version !== requestVersion) return;
    if (rows[0]?.id !== history.value[0]?.id) refreshPlan();
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
  refreshPlan();
  refreshHistory();
  timer = setInterval(() => { if (!document.hidden) { refreshHistory(); checkPairing(); } }, 5000);
});
onBeforeUnmount(() => { ++requestVersion; ++planVersion; clearInterval(timer); });
const storageKey = 'learnloop:coding:v1:' + props.learner;
const link = computed(() => editorUrl(path.value, selected.value));

onMounted(() => {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    for (const [id, entry] of Object.entries(saved || {})) records[id] = Object.assign(blank(), entry);
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
    <CodingExerciseManager @changed="onCustomChanged" />
    <section v-if="plan" class="card">
      <h2>แผนฝึกของคุณ</h2>
      <p>{{ plan.reason }} · ระดับที่แนะนำ {{ ['','Beginner','Intermediate','Advanced'][plan.level] }}</p>
      <button class="light" @click="selected = plan.recommendation">ฝึก {{ exercises.find(item => item.id === plan.recommendation)?.title }}</button>
      <details v-if="plan.window"><summary>จุดที่ควรฝึกจากการส่ง {{ plan.window }} รอบล่าสุด</summary>
        <ul><li v-for="stat in plan.stats.filter(s => s.attempted)" :key="stat.skill">{{ stat.label }} · เคยผิด {{ stat.missed }}/{{ stat.attempted }} โจทย์ · ผ่านด้วยตนเอง {{ stat.independent }}</li></ul>
      </details>
      <template v-if="plan.pending.length"><h3>โจทย์ทบทวนจากกรณีที่ผิด</h3>
        <button class="light" v-for="id in plan.pending" :key="id" @click="selected = id">{{ exercises.find(e => e.id === id)?.title }}</button>
      </template>
    </section>
    <label>เลือกโจทย์ JavaScript
      <select v-model="selected">
        <option v-for="item in exercises" :key="item.id" :value="item.id">
          {{ item.title }} {{ ['','· Beginner','· Intermediate','· Advanced'][item.level] }}{{ records[item.id].due && records[item.id].due <= Date.now() ? ' · ถึงเวลาทบทวน' : '' }}
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
      <h2>ลงมือทำใน VS Code · ซิงก์อัตโนมัติ</h2>
      <p>ติดตั้ง LearnLoop CodeLab Extension ครั้งเดียว แล้วเปิดโจทย์นี้ใน VS Code ได้โดยไม่ต้องดาวน์โหลด .mjs หรือจัดการไฟล์ผลเอง</p>
      <div class="pair-actions">
        <button type="button" class="light" @click="pairWithVSCode">เชื่อม VS Code</button>
        <a :href="exerciseLink">เปิดโจทย์ใน VS Code</a>
      </div>
      <template v-if="pairing">
        <strong v-if="pairingReady">VS Code จับคู่สำเร็จแล้ว</strong>
        <template v-else>
          <p>รหัสจับคู่แบบใช้ครั้งเดียว (หมดอายุใน 10 นาที) คัดลอกไปใส่คำสั่ง LearnLoop: Connect ใน VS Code หรือกดลิงก์ด้านล่าง</p>
          <code class="pair-code">{{ pairing.code }}</code>
          <a :href="pairLink">เชื่อมผ่าน VS Code โดยตรง</a>
        </template>
      </template>
      <p v-if="pairingError" role="alert">{{ pairingError }}</p>
      <small>จาก VS Code กด LearnLoop: Run Tests and Sync Results ผลรายกรณีจะกลับมาแสดงด้านล่างอัตโนมัติ หากไม่พบ Extension ให้ติดตั้งจาก apps/vscode-extension ตาม README</small>
      <details><summary>วิธีเดิม: ดาวน์โหลดไฟล์ .mjs และรันผ่าน Terminal</summary>
      <button :disabled="downloading" @click="download">ดาวน์โหลด {{ selected }}.mjs</button>
      <p>เปิดไฟล์ด้วย VS Code หรือวางพาธเต็มของไฟล์ที่ดาวน์โหลดเพื่อเปิดจากหน้านี้</p>
      <label>พาธไฟล์ในเครื่อง<input v-model="path" :placeholder="'C:/Downloads/' + selected + '.mjs'" /></label>
      <a v-if="link" :href="link">เปิดไฟล์ใน VS Code</a>
      <small v-else-if="path">พาธต้องลงท้ายด้วย /{{ selected }}.mjs</small>
      <p>เขียนฟังก์ชัน solve แล้วบันทึก เปิด Terminal ในโฟลเดอร์เดียวกับไฟล์ ใช้ Node.js 22 รันคำสั่ง</p>
      <pre>node {{ selected }}.mjs</pre>
      <p>เมื่อรัน ไฟล์นี้จะส่งโค้ดในส่วนคำตอบและคะแนนเข้าบัญชีของคุณอัตโนมัติ แม้ปิดหน้าเว็บแล้ว ไฟล์โจทย์ผูกกับบัญชีของคุณ ควรแชร์เฉพาะโค้ดคำตอบ</p>
      </details>
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
        <div v-if="row.reports?.length" class="case-reports">
          <h3>Test Cases รายกรณี</h3>
          <ul>
            <li v-for="test in row.reports" :key="test.index">
              <strong>{{ test.passed ? 'ผ่าน' : 'ไม่ผ่าน' }} · Case {{ test.index + 1 }}</strong>
              <span v-if="!test.passed"> · Expected: {{ JSON.stringify(test.expected) }} · Actual: {{ JSON.stringify(test.actual) }} <span v-if="test.error">· {{ test.error }}</span></span>
            </li>
          </ul>
        </div>
      </details>
    </section>
    <CodingTutor v-if="history.length" :key="selected" :history="history" :exercise="exercise" @saved="refreshHistory(); refreshPlan()" />
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
.pair-actions { display: flex; gap: .75rem; flex-wrap: wrap; align-items: center; }
.pair-code { overflow-wrap: anywhere; user-select: all; }
.case-reports { max-width: 100%; overflow-wrap: anywhere; }
label, textarea, input, select { width: 100%; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
