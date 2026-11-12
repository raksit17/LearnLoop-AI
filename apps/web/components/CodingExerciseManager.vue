<script setup>
const emit = defineEmits(['changed']);
const { data, goalId, topicId, page, api, refresh } = useLoop();
const { busy, run } = useAction();

const entries = ref([]);
const loading = ref(false);
const error = ref('');
const status = ref('');
const query = ref('');
const selectedGoal = ref(goalId.value || '');
const selectedTopic = ref(topicId.value || '');
const toolsOpen = ref(false);
const classroomMode = ref('workspace');
const editingId = ref('');
const emptyForm = () => ({
  title: '', prompt: '', hint: '', example: '', skill: 'custom', level: 1,
  topicId: selectedTopic.value || '', casesText: '',
});
const form = reactive(emptyForm());

const goals = computed(() => data.value?.goals || []);
const topics = computed(() => (data.value?.topics || []).filter(t => t.goalId === selectedGoal.value));
const contextTopic = computed(() => (data.value?.topics || []).find(t => t.id === selectedTopic.value));
const sources = computed(() => (data.value?.sources || []).filter(s => s.topicId === selectedTopic.value));
const questions = computed(() => (data.value?.questions || []).filter(q => q.topicId === selectedTopic.value));
const results = computed(() => entries.value.filter(item => {
  if (selectedGoal.value) {
    const topic = (data.value?.topics || []).find(t => t.id === item.topicId);
    if (!topic || topic.goalId !== selectedGoal.value) return false;
  }
  if (selectedTopic.value && item.topicId !== selectedTopic.value) return false;
  const q = query.value.trim().toLocaleLowerCase();
  return !q || [item.title, item.prompt, item.skill].some(x => String(x).toLocaleLowerCase().includes(q));
}));

watch(selectedGoal, () => {
  if (!topics.value.some(t => t.id === selectedTopic.value)) selectedTopic.value = '';
});
watch(selectedTopic, topic => {
  if (!editingId.value) form.topicId = topic || '';
  if (toolsOpen.value && classroomMode.value === 'workspace') useTopic();
});

async function load() {
  loading.value = true;
  try { entries.value = await api('coding/custom'); error.value = ''; }
  catch (e) { error.value = e.message || 'โหลดโจทย์ไม่สำเร็จ'; }
  finally { loading.value = false; }
}
onMounted(load);

function reset() {
  editingId.value = '';
  Object.assign(form, emptyForm());
  status.value = '';
}
function edit(item) {
  editingId.value = item.id;
  Object.assign(form, {
    title: item.title, prompt: item.prompt, hint: item.hint, example: item.example,
    skill: item.skill, level: item.level, topicId: item.topicId || '',
    casesText: item.cases?.length ? JSON.stringify(item.cases, null, 2) : '',
  });
  status.value = 'กำลังแก้ไข ' + item.title + ' — หากเปลี่ยนเงื่อนไข Test ผลเก่าอาจไม่ตรงกับโจทย์เวอร์ชันใหม่';
}
function useTopic() {
  const t = (data.value?.topics || []).find(x => x.id === selectedTopic.value);
  if (!t) return;
  goalId.value = t.goalId;
  topicId.value = t.id;
}
function openClassroom() {
  useTopic();
  page.value = 'learn';
}
function toggleClassroomTools() {
  toolsOpen.value = !toolsOpen.value;
  if (toolsOpen.value && classroomMode.value === 'workspace') useTopic();
}
function parseCases() {
  if (!form.casesText.trim()) return [];
  let parsed;
  try { parsed = JSON.parse(form.casesText); }
  catch { throw Error('Test Cases ต้องเป็น JSON เช่น [[1,2],[2,3],[3,4]]'); }
  if (!Array.isArray(parsed) || parsed.length !== 3 || !parsed.every(v => Array.isArray(v) && v.length === 2))
    throw Error('ต้องใส่ 3 Test Cases โดยแต่ละกรณีเป็น [input, expected] หรือเว้นว่างเป็นโจทย์ร่าง');
  return parsed;
}
async function save() {
  error.value = ''; status.value = '';
  const title = form.title.trim() || form.prompt.trim().split('\n')[0].slice(0, 80);
  const payload = {
    title, prompt: form.prompt.trim(), hint: form.hint.trim(), example: form.example.trim(),
    skill: form.skill, level: Number(form.level), topicId: form.topicId || null, cases: parseCases(),
  };
  const id = editingId.value;
  const path = id ? 'coding/custom/' + id.slice('custom-'.length) : 'coding/custom';
  const saved = await api(path, payload, id ? 'PATCH' : 'POST');
  await load();
  reset();
  status.value = saved.ready
    ? 'บันทึกแล้ว — เลือกโจทย์เพื่อเปิดใน VS Code ได้ทันที'
    : 'บันทึก Prompt เป็นโจทย์ร่างแล้ว เพิ่ม Test Cases หรือให้ AI สร้างก่อนใช้งานใน VS Code';
  emit('changed', saved.ready ? saved.id : null);
}
async function aiDraft() {
  error.value = ''; status.value = '';
  const response = await api('coding/custom/draft', {
    prompt: form.prompt.trim(), topicId: form.topicId || null,
  });
  Object.assign(form, {
    title: response.title, prompt: response.prompt, hint: response.hint,
    example: response.example, level: response.level, skill: response.skill,
    casesText: JSON.stringify(response.cases, null, 2),
  });
  status.value = 'AI สร้างโจทย์และ Test Cases ฉบับร่างแล้ว กรุณาตรวจความถูกต้องและกดบันทึก';
}
async function remove(item) {
  const confirmed = window.prompt('พิมพ์ชื่อโจทย์เพื่อยืนยันการลบถาวร: ' + item.title);
  if (confirmed !== item.title) return;
  await api('coding/custom/' + item.id.slice('custom-'.length), { confirmTitle: item.title }, 'DELETE');
  if (editingId.value === item.id) reset();
  await load();
  status.value = 'ลบโจทย์แล้ว (ประวัติการส่งเดิมยังถูกเก็บไว้ในฐานข้อมูล)';
  emit('changed', null);
}
function action(fn) {
  error.value = '';
  run(async () => {
    try { await fn(); }
    catch (e) { error.value = e.message || 'ดำเนินการไม่สำเร็จ'; }
  });
}
</script>

<template>
  <section class="card coding-manager">
    <header>
      <p class="eyebrow dark">LEARNLOOP CODING WORKSPACE</p>
      <h2>โจทย์ของฉัน · สร้างจาก Prompt</h2>
      <p>สร้างโจทย์เองจากคำสั่งที่ต้องการ เชื่อมกับเป้าหมายและหัวข้อห้องเรียน ใช้ AI ร่าง Test Cases หรือกรอกเองก็ได้</p>
    </header>

    <div class="classroom-choices">
      <label>เป้าหมายจากห้องเรียน
        <select v-model="selectedGoal">
          <option value="">ทุกเป้าหมาย / โจทย์ที่ไม่ได้ผูกหัวข้อ</option>
          <option v-for="g in goals" :key="g.id" :value="g.id">{{ g.title }} ({{ g.domain }})</option>
        </select>
      </label>
      <label>หัวข้อบทเรียน
        <select v-model="selectedTopic" :disabled="!selectedGoal">
          <option value="">ทุกหัวข้อในเป้าหมาย</option>
          <option v-for="t in topics" :key="t.id" :value="t.id">{{ t.title }}</option>
        </select>
      </label>
      <button class="light" type="button" @click="toggleClassroomTools">
        {{ toolsOpen ? 'ซ่อนเครื่องมือห้องเรียน' : 'เปิดเครื่องมือห้องเรียน (CRUD / เอกสาร / AI / คำถาม)' }}
      </button>
    </div>

    <section v-if="contextTopic" class="lesson-context">
      <h3>{{ contextTopic.title }}</h3>
      <p>{{ contextTopic.notes?.trim() || 'ยังไม่มีบันทึกสำหรับหัวข้อนี้' }}</p>
      <small>แหล่งเรียน {{ sources.length }} รายการ · คำถามทบทวน {{ questions.length }} ข้อ</small>
      <div class="actions">
        <button class="light" type="button" @click="openClassroom">เปิดบทเรียนนี้ในห้องเรียน</button>
      </div>
    </section>

    <div v-if="toolsOpen" class="classroom-tools">
      <div class="actions">
        <button type="button" class="light" @click="classroomMode = 'manage'">จัดการ Goal / Topic</button>
        <button type="button" class="light" @click="classroomMode = 'workspace'; useTopic()">Workspace / AI / Question Bank</button>
      </div>
      <LearningManager v-if="classroomMode === 'manage'" />
      <Workspace v-else-if="contextTopic" />
      <p v-else>เลือกเป้าหมายและหัวข้อด้านบนเพื่อเปิดห้องเรียน หรือไปที่จัดการ Goal / Topic</p>
    </div>

    <form class="exercise-form" @submit.prevent="action(save)">
      <h3>{{ editingId ? 'แก้ไขโจทย์' : 'สร้างโจทย์ใหม่' }}</h3>
      <label>ชื่อโจทย์ (ไม่ใส่ก็ใช้บรรทัดแรกของ Prompt)
        <input v-model="form.title" maxlength="160" placeholder="เช่น รับมือ Promise rejection" />
      </label>
      <label>Prompt / ข้อกำหนดโจทย์
        <textarea v-model="form.prompt" rows="5" required minlength="8" maxlength="8000" placeholder="อธิบายสิ่งที่ต้องการให้เขียน เงื่อนไข อินพุต ผลลัพธ์ และกรณีขอบ..." />
      </label>
      <div class="actions">
        <button type="button" class="light" :disabled="busy || form.prompt.trim().length < 8" @click="action(aiDraft)">
          ให้ AI สร้างโจทย์และ Tests จาก Prompt
        </button>
        <small>ใช้ Ollama ในเครื่อง AI สร้างเป็นฉบับร่าง ไม่บันทึกทันที</small>
      </div>
      <div class="form-grid">
        <label>หัวข้อที่เชื่อมกับห้องเรียน
          <select v-model="form.topicId">
            <option value="">ไม่ผูกกับหัวข้อ</option>
            <option v-for="t in data?.topics || []" :key="t.id" :value="t.id">{{ data.goals.find(g => g.id === t.goalId)?.title }} / {{ t.title }}</option>
          </select>
        </label>
        <label>ประเภทโจทย์
          <select v-model="form.skill">
            <option value="custom">JavaScript ทั่วไป</option>
            <option value="collection">Array / Collection</option>
            <option value="counts">Counting / Aggregation</option>
            <option value="batch">Batch / Chunking</option>
            <option value="async">Promise / Async (มี lookup)</option>
          </select>
        </label>
        <label>ระดับความยาก
          <select v-model.number="form.level">
            <option :value="1">Beginner</option>
            <option :value="2">Intermediate</option>
            <option :value="3">Advanced</option>
          </select>
        </label>
      </div>
      <label>คำใบ้ (Hint)
        <textarea v-model="form.hint" rows="2" maxlength="1500" placeholder="ถามนำ โดยไม่เฉลยวิธีทำ" />
      </label>
      <label>ตัวอย่าง Input → Output
        <input v-model="form.example" maxlength="1200" placeholder="[1,2,1] → [1,2]" />
      </label>
      <label>Test Cases (JSON) · ต้องมี 3 คู่ [input, expected] เพื่อรันใน VS Code
        <textarea v-model="form.casesText" rows="6" class="code-input" placeholder="[[[], []], [[1,2,1], [1,2]], [[0,0], [0]]]" />
      </label>
      <small>เว้น Test Cases ว่างได้เพื่อบันทึก Prompt เป็นโจทย์ร่าง และกลับมาแก้ไขภายหลัง สำหรับ Async/Promise ใช้ฟังก์ชัน solve(input, lookup) โดย lookup(id) จำลองข้อมูลในเครื่อง</small>
      <div class="actions">
        <button :disabled="busy || form.prompt.trim().length < 8" type="submit">
          {{ editingId ? 'บันทึกการแก้ไข' : 'บันทึกโจทย์ของฉัน' }}
        </button>
        <button v-if="editingId" class="light" type="button" @click="reset">ยกเลิกการแก้ไข</button>
      </div>
    </form>

    <section class="exercise-table">
      <h3>คลังโจทย์ที่สร้างเอง ({{ results.length }})</h3>
      <label>ค้นหาโจทย์
        <input v-model="query" placeholder="ค้นหาชื่อ, Prompt หรือทักษะ" />
      </label>
      <p v-if="loading">กำลังโหลดโจทย์...</p>
      <p v-else-if="!results.length">ยังไม่มีโจทย์ในรายการนี้ เริ่มจากพิมพ์ Prompt ด้านบน</p>
      <div v-else class="table-scroll">
        <table>
          <thead><tr><th>โจทย์</th><th>ระดับ / สถานะ</th><th>จัดการ</th></tr></thead>
          <tbody>
            <tr v-for="item in results" :key="item.id">
              <td><strong>{{ item.title }}</strong><small>{{ item.prompt.slice(0, 120) }}</small></td>
              <td>{{ ['', 'Beginner', 'Intermediate', 'Advanced'][item.level] }}<small>{{ item.ready ? 'พร้อมฝึก' : 'ร่าง · รอ Test Cases' }}</small></td>
              <td><div class="actions">
                <button type="button" class="light" @click="edit(item)">แก้ไข</button>
                <button v-if="item.ready" type="button" class="light" @click="emit('changed', item.id)">ฝึกโจทย์นี้</button>
                <button type="button" class="light" @click="action(() => remove(item))">ลบ</button>
              </div></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
    <p v-if="status" role="status">{{ status }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.coding-manager { display: grid; gap: 1rem; justify-items: stretch; }
.coding-manager header { display: grid; gap: .4rem; }
.coding-manager header h2 { margin: 0; }
.classroom-choices, .exercise-form { display: grid; gap: .75rem; }
.form-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(12rem,1fr)); gap: .75rem; }
label { display: grid; gap: .35rem; }
textarea,select,input { width: 100%; }
.actions { display: flex; gap: .5rem; flex-wrap: wrap; align-items: center; }
.lesson-context, .classroom-tools { border: 1px solid var(--border, #d1d5db); padding: 1rem; border-radius: .8rem; overflow: auto; }
.lesson-context { white-space: pre-wrap; }
.exercise-form { border-top: 1px solid var(--border, #d1d5db); padding-top: 1rem; }
.exercise-form button { justify-self: start; }
.code-input { font-family: ui-monospace,monospace; white-space: pre; }
.table-scroll { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; text-align: left; }
th,td { border-bottom: 1px solid var(--border, #d1d5db); padding: .7rem; vertical-align: top; }
td small { display: block; margin-top: .4rem; }
</style>
