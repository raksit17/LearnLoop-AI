<script setup>
const props = defineProps({ history: Array, exercise: Object });
const emit = defineEmits(['saved']);
const { api } = useLoop();
const choice = ref('');
const row = computed(() => props.history.find(r => r.id === choice.value) || props.history[0]);
const mode = ref('hint1');
const pending = ref(false);
const error = ref('');
const step = ref(0);
const fresh = reactive({});
const modes = { hint1:'1 · คำถามชวนคิด', hint2:'2 · ชี้แนวทาง', hint3:'3 · ตัวอย่างพร้อมเหตุผล', review:'Code Review', visual:'Code Visualizer' };
const content = computed(() => fresh[row.value.id + mode.value] ??
  row.value.tutorNotes?.find(n => n.kind === mode.value)?.content);
const current = computed(() => content.value?.steps?.[step.value]);
const used = computed(() => Object.keys(modes).filter(k => k.startsWith('hint') &&
  (fresh[row.value.id+k] || row.value.tutorNotes?.some(n => n.kind === k))).map(k=>k.slice(-1)));
const probe = computed(() => props.exercise.cases[row.value.failedCases?.[0] ?? 0]);
watch([() => row.value.id,mode], () => { step.value = 0; error.value = ''; });
async function request() {
  const id = row.value.id;
  const kind = mode.value;
  pending.value = true;
  error.value = '';
  try {
    fresh[id + kind] = await api('coding/coach/' + id, { kind });
    emit('saved');
  } catch (e) { error.value = e.message; }
  finally { pending.value = false; }
}
</script>
<template>
  <section class="card tutor">
    <h2>AI Coding Tutor</h2>
    <label>คำตอบที่ต้องการฝึก
      <select v-model="choice"><option value="">รอบล่าสุด</option>
        <option v-for="r in history" :key="r.id" :value="r.id">{{ new Date(r.createdAt).toLocaleString('th-TH') }} · {{ r.passed }}/{{ r.total }}</option>
      </select>
    </label>
    <p v-if="row.failedCases?.length">กรณีที่ยังไม่ผ่าน</p>
    <ul v-if="row.failedCases?.length"><li v-for="i in row.failedCases" :key="i"><code>{{ JSON.stringify(exercise.cases[i][0]) }}</code> → คาดว่า <code>{{ JSON.stringify(exercise.cases[i][1]) }}</code></li></ul>
    <label>เลือกวิธีฝึก<select v-model="mode"><option v-for="(label,k) in modes" :key="k" :value="k">{{ label }}</option></select></label>
    <small v-if="used.length">เคยเปิดคำใบ้ระดับ {{ used.join(', ') }} สำหรับรอบนี้</small>
    <button v-if="!content" :disabled="pending" @click="request">{{ pending ? 'กำลังวิเคราะห์…' : 'ขอ' + modes[mode] }}</button>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="content?.hint" class="preserve">{{ content.hint }}</p>
    <template v-if="content && mode === 'review'">
      <article v-for="(item,category) in content" :key="category"><strong>{{ category }} · บรรทัด {{ item.line }}</strong>
        <pre>{{ row.answer.split('\n')[item.line-1] }}</pre><p>{{ item.feedback }}</p></article>
    </template>
    <template v-if="current && mode === 'visual'">
      <h3>ภาพจำลองจาก AI</h3><p>อินพุต {{ JSON.stringify(probe[0]) }} · ผลที่โจทย์คาดหวัง {{ JSON.stringify(probe[1]) }}</p>
      <ol class="flow"><li v-for="(s,i) in content.steps" :key="i"><button class="light" :aria-current="step === i ? 'step' : undefined" @click="step=i">{{ i+1 }} · {{ s.event }}</button></li></ol>
      <strong>ขั้น {{ step+1 }} · บรรทัด {{ current.line }}</strong><pre>{{ row.answer.split('\n')[current.line-1] }}</pre>
      <figure v-if="current.condition" class="branch"><figcaption>{{ current.condition }}</figcaption>
        <div><span>↙ จริง</span><p>{{ current.yes }}</p></div><div><span>เท็จ ↘</span><p>{{ current.no }}</p></div>
      </figure>
      <dl><dt>ค่าตัวแปร</dt><dd>{{ current.variables }}</dd><dt>Call stack</dt><dd>{{ current.stack }}</dd><dt>Data flow</dt><dd>{{ current.flow }}</dd></dl>
    </template>
  </section>
</template>
<style scoped>
.tutor { display:grid; gap:.7rem; } .preserve, pre { white-space:pre-wrap; overflow-wrap:anywhere; }
.flow { list-style:none; padding:0; } .flow li + li::before { content:'↓'; display:block; margin-left:1rem; }
[aria-current="step"] { outline:2px solid currentColor; } dt { font-weight:600; } dd { margin:0 0 .6rem; }
.branch { display:grid; grid-template-columns:1fr 1fr; gap:.6rem; margin:.5rem 0; text-align:center; }
.branch figcaption { grid-column:1/-1; font-family:monospace; }
.branch div { padding:.5rem; border:1px solid currentColor; border-radius:.5rem; }
</style>
