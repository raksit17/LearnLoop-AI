<script setup lang="ts">
type VocabWord = {
  id: string; groupId: string; word: string; meaning: string;
  partOfSpeech: string; pronunciation: string; example: string;
  exampleTranslation: string; nuance: string; dueAt: string; days: number;
};
type VocabGroup = {
  id: string; name: string; description: string; words: VocabWord[];
};
const { api, message, health } = useLoop();
const { busy, run } = useAction();
const groups = ref<VocabGroup[]>([]);
const selectedId = ref("");
const search = ref("");
type AiWord = Omit<VocabWord, "id" | "groupId" | "dueAt" | "days">;
type AiDraft = { groupName: string; groupDescription: string; words: AiWord[] };
const aiTerm = ref("");
const aiDraft = ref<AiDraft | null>(null);
const practiceMode = ref<"meaning" | "cloze" | "contrast">("meaning");
const mode = ref<"library" | "review">("library");
const groupDraft = reactive({ name: "", description: "" });
const editGroup = ref(false);
const groupEdit = reactive({ name: "", description: "" });
const showWordForm = ref(false);
const editWordId = ref("");
function emptyWord() {
  return { word: "", meaning: "", partOfSpeech: "adjective", pronunciation: "",
    example: "", exampleTranslation: "", nuance: "" };
}
const wordDraft = reactive(emptyWord());
const partNames: Record<string, string> = {
  noun: "คำนาม", verb: "คำกริยา", phrasal_verb: "กริยาวลี (Phrasal Verb)", adjective: "คำคุณศัพท์",
  adverb: "คำวิเศษณ์", phrase: "วลี", other: "อื่น ๆ",
};
const words = computed(() => groups.value.flatMap(group => group.words.map(word => ({ group, word }))));
const due = computed(() => words.value.filter(({ word }) => Date.parse(word.dueAt) <= Date.now())
  .sort((a, b) => Date.parse(a.word.dueAt) - Date.parse(b.word.dueAt)));
const upcoming = computed(() => words.value.length
  ? words.value.reduce((earliest, entry) =>
      Date.parse(entry.word.dueAt) < Date.parse(earliest.word.dueAt) ? entry : earliest)
  : null);
const visibleGroups = computed(() => {
  const term = search.value.trim().toLocaleLowerCase();
  if (!term) return groups.value;
  return groups.value.filter(group =>
    [group.name, group.description, ...group.words.flatMap(word =>
      [word.word, word.meaning, word.example, word.nuance])].some(value =>
      value.toLocaleLowerCase().includes(term)));
});
const selectedGroup = computed(() =>
  visibleGroups.value.find(g => g.id === selectedId.value) || visibleGroups.value[0] || null);
const activeCard = computed(() => due.value[0] || null);
const otherSynonyms = computed(() => activeCard.value?.group.words.filter(
  word => word.id !== activeCard.value?.word.id) || []);
const clozePrompt = computed(() => {
  if (!activeCard.value) return "";
  const example = activeCard.value.word.example;
  const word = activeCard.value.word.word;
  if (!word || !example) return "";
  const escaped = word.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
  const re = new RegExp("(?<![\\p{L}])" + escaped + "(?![\\p{L}])", "iu");
  return re.test(example) ? example.replace(re, "_____") : "";
});
const canContrast = computed(() => Boolean(otherSynonyms.value.length && activeCard.value?.word.nuance.trim()));
const exerciseOptions = computed(() => activeCard.value?.group.words.slice(0, 5) || []);
function setPractice(next: "meaning" | "cloze" | "contrast") {
  practiceMode.value = next;
  guess.value = "";
  revealed.value = false;
}

const guess = ref("");
const revealed = ref(false);
const reviewRequest = ref("");
const reviewAnswer = computed(() => {
  if (!activeCard.value) return "different";
  const normalized = (value: string) => value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
  const key = normalized(guess.value);
  if (!key) return "different";
  if (key === normalized(activeCard.value.word.word)) return "exact";
  return otherSynonyms.value.some(w => normalized(w.word) === key) ? "synonym" : "different";
});
watch(() => activeCard.value?.word.id, () => {
  guess.value = "";
  revealed.value = false;
  if (import.meta.client) reviewRequest.value = crypto.randomUUID();
}, { immediate: true });

async function load() {
  groups.value = await api("dictionary");
  if (!groups.value.some(group => group.id === selectedId.value))
    selectedId.value = groups.value[0]?.id || "";
}
onMounted(() => { load().catch((error: Error) => { message.value = error.message; }); });
function chooseGroup(id: string) {
  selectedId.value = id;
  editGroup.value = false;
  closeWordForm();
}
async function createGroup() {
  const created = await api("dictionary/groups", { ...groupDraft });
  groupDraft.name = groupDraft.description = "";
  search.value = "";
  await load();
  selectedId.value = created.id;
  message.value = "สร้างกลุ่มความหมายแล้ว เริ่มเพิ่มคำที่มีความหมายใกล้เคียงกันได้เลย";
}
function startGroupEdit() {
  if (!selectedGroup.value) return;
  groupEdit.name = selectedGroup.value.name;
  groupEdit.description = selectedGroup.value.description;
  editGroup.value = true;
}
async function saveGroup() {
  if (!selectedGroup.value) return;
  await api("dictionary/groups/" + selectedGroup.value.id, { ...groupEdit }, "PATCH");
  editGroup.value = false;
  await load();
  message.value = "แก้ไขกลุ่มความหมายแล้ว";
}
async function removeGroup() {
  if (!selectedGroup.value) return;
  const group = selectedGroup.value;
  if (!window.confirm(`ลบกลุ่ม "${group.name}" และคำศัพท์ ${group.words.length} คำ รวมประวัติทบทวนทั้งหมดหรือไม่?`)) return;
  await api("dictionary/groups/" + group.id, {}, "DELETE");
  editGroup.value = false;
  closeWordForm();
  await load();
  message.value = "ลบกลุ่มความหมายแล้ว";
}
function closeWordForm() {
  Object.assign(wordDraft, emptyWord());
  editWordId.value = "";
  showWordForm.value = false;
}
function startWord() {
  closeWordForm();
  showWordForm.value = true;
}
function startEditWord(word: VocabWord) {
  const { word: term, meaning, partOfSpeech, pronunciation, example, exampleTranslation, nuance } = word;
  Object.assign(wordDraft, { word: term, meaning, partOfSpeech, pronunciation, example, exampleTranslation, nuance });
  editWordId.value = word.id;
  showWordForm.value = true;
}
async function saveWord() {
  const group = selectedGroup.value;
  if (!group) return;
  if (editWordId.value) {
    await api("dictionary/words/" + editWordId.value, { ...wordDraft }, "PATCH");
  } else {
    await api("dictionary/words", { ...wordDraft, groupId: group.id });
  }
  closeWordForm();
  await load();
  message.value = "บันทึกคำศัพท์แล้ว";
}
async function removeWord(word: VocabWord) {
  if (!window.confirm(`ลบคำว่า "${word.word}" และประวัติการทบทวนคำนี้หรือไม่?`)) return;
  await api("dictionary/words/" + word.id, {}, "DELETE");
  closeWordForm();
  await load();
  message.value = "ลบคำศัพท์แล้ว";
}
function pronounce(text: string) {
  if (!("speechSynthesis" in window)) {
    message.value = "เบราว์เซอร์นี้ไม่รองรับการอ่านออกเสียง";
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.83;
  window.speechSynthesis.speak(utterance);
}
async function grade(rating: number) {
  if (!activeCard.value) return;
  const { word } = activeCard.value;
  const result = await api("dictionary/words/" + word.id + "/reviews", {
    request: reviewRequest.value, rating,
  });
  await load();
  message.value = "นัดทบทวนคำนี้อีกครั้ง " + new Date(result.dueAt).toLocaleString("th-TH");
}
async function generateAiVocabulary() {
  aiDraft.value = null;
  const job = await api("ai/dictionary", {word: aiTerm.value.trim()});
  for (let attempt = 0; attempt < 200; attempt++) {
    const status = await api("ai/jobs/" + job.jobId);
    if (status.state === "completed") {
      aiDraft.value = status.result as AiDraft;
      message.value = "AI สร้างคำแนะนำแล้ว ตรวจสอบคำแปลและบริบทก่อนบันทึก";
      return;
    }
    if (status.state === "failed") throw Error(status.error || "AI สร้างข้อมูลไม่สำเร็จ กรุณาลองใหม่");
    await new Promise(resolve => setTimeout(resolve, 1200));
  }
  throw Error("AI ยังประมวลผลอยู่ กรุณาลองสร้างใหม่ภายหลัง");
}
async function importAiVocabulary() {
  if (!aiDraft.value) return;
  const saved = await api("dictionary/ai/import", aiDraft.value);
  await load();
  search.value = "";
  selectedId.value = saved.groupId;
  aiDraft.value = null;
  message.value = `บันทึก ${saved.inserted} คำ ข้ามคำซ้ำ ${saved.skipped} คำ พร้อมให้ฝึกจำแล้ว`;
}
function beginReview() {
  mode.value = "review";
  revealed.value = false;
  guess.value = "";
}
</script>

<template>
  <div class="vocab-page">
    <p class="eyebrow dark">VOCABULARY • ACTIVE RECALL</p>
    <div class="vocab-hero">
      <div>
        <h1>Dictionary เพื่อการจำศัพท์</h1>
        <p>จดคำที่แปลใกล้กันเป็นกลุ่ม • แยกบริบทให้ชัด • ทบทวนด้วยการนึกคำตอบก่อนเปิดเฉลย</p>
      </div>
      <button class="vocab-hero-button" :disabled="busy || !due.length" @click="beginReview">
        ทบทวนที่ถึงกำหนด ({{ due.length }})
      </button>
    </div>

    <div class="vocab-stats">
      <div><strong>{{ words.length }}</strong><span>คำศัพท์ทั้งหมด</span></div>
      <div><strong>{{ groups.length }}</strong><span>กลุ่มความหมาย</span></div>
      <div><strong>{{ due.length }}</strong><span>คำที่ควรทบทวน</span></div>
    </div>
    <div class="vocab-switch" role="group" aria-label="โหมดพจนานุกรม">
      <button :class="{ selected: mode === 'library' }" @click="mode = 'library'">คลังคำศัพท์</button>
      <button :class="{ selected: mode === 'review' }" @click="beginReview">ฝึกจำและทบทวน</button>
    </div>

    <section v-if="mode === 'review'" class="card vocab-review">
      <template v-if="activeCard">
        <div class="vocab-review-top">
          <span class="pill">{{ activeCard.group.name }}</span>
          <span class="vocab-muted">คงเหลือ {{ due.length }} คำ</span>
        </div>
        <div class="vocab-practice-switch" role="group" aria-label="เลือกรูปแบบการฝึก">
          <button :class="{ selected: practiceMode === 'meaning' }" @click="setPractice('meaning')">แปลไทย → อังกฤษ</button>
          <button :disabled="!clozePrompt" :class="{ selected: practiceMode === 'cloze' }" @click="setPractice('cloze')">เติมคำในประโยค</button>
          <button :disabled="!canContrast" :class="{ selected: practiceMode === 'contrast' }" @click="setPractice('contrast')">เลือก Synonym</button>
        </div>
        <p class="eyebrow dark">{{ practiceMode === 'cloze' ? 'FILL IN THE BLANK' : practiceMode === 'contrast' ? 'CHOOSE THE RIGHT SYNONYM' : 'RECALL THE ENGLISH WORD' }}</p>
        <h2 v-if="practiceMode === 'cloze' && clozePrompt" class="vocab-cloze">{{ clozePrompt }}</h2>
        <h2 v-else-if="practiceMode === 'contrast' && canContrast">คำใดตรงกับความหมายและบริบทนี้มากที่สุด?</h2>
        <h2 v-else>{{ activeCard.word.meaning }}</h2>
        <p v-if="practiceMode === 'contrast' && canContrast" class="vocab-muted">{{ activeCard.word.nuance }}</p>
        <p v-else class="vocab-muted">{{ partNames[activeCard.word.partOfSpeech] }} · {{ activeCard.word.meaning }}</p>
        <form v-if="!revealed" @submit.prevent="revealed = true">
          <div v-if="practiceMode === 'contrast' && canContrast" class="vocab-choices">
            <label v-for="choice in exerciseOptions" :key="choice.id" class="vocab-choice">
              <input v-model="guess" type="radio" name="synonym" :value="choice.word" />
              <span>{{ choice.word }}</span>
            </label>
          </div>
          <label v-else for="vocab-answer">ลองพิมพ์คำศัพท์จากความจำ
            <input id="vocab-answer" v-model="guess" autocomplete="off" spellcheck="false" placeholder="Write the English word…" />
          </label>
          <div class="actions">
            <button type="submit">เปิดเฉลย</button>
            <span class="vocab-muted">ยังนึกไม่ออกก็เปิดเฉลยได้</span>
          </div>
        </form>
        <div v-else class="vocab-revealed" aria-live="polite">
          <p v-if="reviewAnswer === 'exact'" class="vocab-feedback">ตอบตรงคำเป้าหมาย ✓</p>
          <p v-else-if="reviewAnswer === 'synonym'" class="vocab-feedback">
            "{{ guess }}" เป็นคำพ้องความหมายในกลุ่มนี้ แต่คำที่กำลังฝึกคือ
          </p>
          <p v-else-if="guess" class="vocab-muted">คุณตอบว่า "{{ guess }}" ลองเปรียบเทียบกับคำเป้าหมาย</p>
          <p v-else class="vocab-muted">ทบทวนคำนี้ก่อนให้คะแนนตัวเอง</p>
          <div class="vocab-answer-line">
            <h3>{{ activeCard.word.word }}</h3>
            <button class="light" type="button" @click="pronounce(activeCard.word.word)" aria-label="ฟังการออกเสียง">🔊 ฟังเสียง</button>
          </div>
          <p v-if="activeCard.word.pronunciation" class="vocab-muted">/{{ activeCard.word.pronunciation }}/</p>
          <blockquote v-if="activeCard.word.example">{{ activeCard.word.example }}
            <small v-if="activeCard.word.exampleTranslation">{{ activeCard.word.exampleTranslation }}</small>
          </blockquote>
          <div v-if="otherSynonyms.length" class="vocab-synonyms">
            <span>คำที่มีความหมายใกล้กัน:</span>
            <span v-for="item in otherSynonyms" :key="item.id" class="vocab-token">{{ item.word }}</span>
          </div>
          <h3>ประเมินความจำของคุณ</h3>
          <p class="vocab-muted">คำพ้องความหมายอาจใช้แทนกันไม่ได้ทุกบริบท ให้คะแนนตามความจำของคำเป้าหมาย</p>
          <div class="vocab-grade">
            <button :disabled="busy" @click="run(() => grade(1))">Again · จำไม่ได้</button>
            <button :disabled="busy" @click="run(() => grade(2))">Hard · ยาก</button>
            <button :disabled="busy" @click="run(() => grade(3))">Good · จำได้</button>
            <button :disabled="busy" @click="run(() => grade(4))">Easy · คล่อง</button>
          </div>
        </div>
      </template>
      <div v-else class="vocab-empty">
        <h2>ยังไม่มีคำศัพท์ที่ถึงกำหนด</h2>
        <p v-if="upcoming">ทบทวนครั้งถัดไป {{ new Date(upcoming.word.dueAt).toLocaleString("th-TH") }}</p>
        <p v-else>เริ่มสร้างกลุ่มความหมายและเพิ่มคำศัพท์ก่อน แล้วระบบจะนำมาเข้าคิวฝึก</p>
        <button class="light" @click="mode = 'library'">กลับคลังคำศัพท์</button>
      </div>
    </section>

    <template v-else>
      <section class="card vocab-ai-panel">
        <div class="vocab-ai-heading">
          <div>
            <p class="eyebrow dark">AI DICTIONARY • POWERED BY OLLAMA</p>
            <h2>พิมพ์คำศัพท์หรือ Phrasal Verb ให้ AI ช่วยเติมทั้งหมด</h2>
            <p class="vocab-muted">รองรับ give up, look after และวลีหลายคำ • คำแปล • IPA • Synonyms • ตัวอย่าง • แบบฝึกจำ</p>
          </div>
          <span class="vocab-pos">{{ health.ai ? "Ollama พร้อมใช้งาน" : "Ollama ยังไม่พร้อม" }}</span>
        </div>
        <form class="vocab-ai-form" @submit.prevent="run(generateAiVocabulary)">
          <label for="vocab-ai-query">คำศัพท์ / Phrasal Verb / วลีภาษาอังกฤษ
            <input id="vocab-ai-query" v-model="aiTerm" placeholder="เช่น happy, give up, look after" required maxlength="120" autocomplete="off" spellcheck="false" />
          </label>
          <button :disabled="busy || !health.ai">{{ busy ? "กำลังทำงาน…" : "✨ สร้างด้วย AI" }}</button>
        </form>
        <p v-if="!health.ai" class="vocab-muted">เริ่ม Ollama และตรวจว่าโมเดลที่ตั้งค่าไว้พร้อมใช้งาน แล้วรีเฟรชหน้าเว็บ</p>
        <p v-if="busy" class="vocab-muted" role="status">โปรดตรวจดูผลเมื่อ AI ตอบกลับ การสร้างคำศัพท์อาจใช้เวลาตามความเร็วของ Ollama</p>
        <div v-if="aiDraft" class="vocab-ai-preview">
          <div class="vocab-section-heading">
            <div>
              <h3>ตรวจสอบผล AI ก่อนเพิ่มลงคลัง</h3>
              <p class="vocab-muted">แก้ไขข้อมูลได้ทุกช่อง ป้องกัน Synonyms ผิดบริบท และคำศัพท์ซ้ำจะถูกข้ามโดยไม่เขียนทับของเดิม</p>
            </div>
            <button type="button" class="light" @click="aiDraft = null">ปิดตัวอย่าง</button>
          </div>
          <form @submit.prevent="run(importAiVocabulary)">
            <div class="vocab-form-grid">
              <label>ชื่อกลุ่มความหมาย (ภาษาไทย)
                <input v-model="aiDraft.groupName" required maxlength="100" />
              </label>
              <label>คำอธิบายกลุ่ม
                <input v-model="aiDraft.groupDescription" maxlength="1000" />
              </label>
            </div>
            <p class="vocab-muted">{{ aiDraft.words.length }} คำที่ AI แนะนำ — เปิดแต่ละคำเพื่อตรวจสอบและแก้ไข</p>
            <details v-for="(word, i) in aiDraft.words" :key="i" class="vocab-ai-word" :open="i === 0">
              <summary>{{ i + 1 }}. {{ word.word }} — {{ word.meaning }}</summary>
              <div class="vocab-form-grid">
                <label>คำศัพท์<input v-model="word.word" required maxlength="120" /></label>
                <label>คำแปล<input v-model="word.meaning" required maxlength="500" /></label>
                <label>ชนิดคำ
                  <select v-model="word.partOfSpeech">
                    <option v-for="(label, key) in partNames" :key="key" :value="key">{{ label }}</option>
                  </select>
                </label>
                <label>คำอ่าน IPA<input v-model="word.pronunciation" maxlength="120" /></label>
              </div>
              <label>ความต่างในการใช้<textarea v-model="word.nuance" maxlength="1200"></textarea></label>
              <label>ตัวอย่างภาษาอังกฤษ<input v-model="word.example" maxlength="1200" /></label>
              <label>คำแปลตัวอย่าง<input v-model="word.exampleTranslation" maxlength="1200" /></label>
              <button type="button" class="vocab-danger-light" :disabled="aiDraft.words.length === 1" @click="aiDraft.words.splice(i, 1)">ไม่เพิ่มคำนี้</button>
            </details>
            <div class="actions">
              <button :disabled="busy || !aiDraft.words.length">บันทึก {{ aiDraft.words.length }} คำเข้าคลังและสร้างคิวฝึกจำ</button>
              <button type="button" class="light" @click="aiDraft = null">ยกเลิก</button>
            </div>
          </form>
        </div>
      </section>
      <section class="card vocab-create">
        <div>
          <h2>สร้างกลุ่ม Synonyms</h2>
          <p class="vocab-muted">หนึ่งกลุ่มแทนความหมายเดียวกัน เช่น ดีใจ (happy, glad, delighted, pleased)</p>
        </div>
        <form class="vocab-create-form" @submit.prevent="run(createGroup)">
          <label>ชื่อกลุ่ม / ความหมายร่วม
            <input v-model="groupDraft.name" required maxlength="100" placeholder="เช่น ดีใจ / มีความสุข" />
          </label>
          <label>คำอธิบาย / ขอบเขตความหมาย
            <input v-model="groupDraft.description" maxlength="1000" placeholder="เช่น ความรู้สึกเชิงบวก แต่ระดับต่างกัน" />
          </label>
          <button :disabled="busy">+ สร้างกลุ่ม</button>
        </form>
      </section>

      <div class="vocab-layout">
        <aside class="vocab-sidebar card">
          <label>ค้นหาคำศัพท์ / ความหมาย
            <input v-model="search" type="search" placeholder="ค้นคำศัพท์หรือบริบท…" />
          </label>
          <p class="vocab-muted">{{ visibleGroups.length }} กลุ่มที่ตรงกับการค้นหา</p>
          <div class="vocab-group-list">
            <button v-for="group in visibleGroups" :key="group.id"
              :class="['vocab-group-option', { selected: selectedGroup?.id === group.id }]"
              @click="chooseGroup(group.id)">
              <strong>{{ group.name }}</strong>
              <small>{{ group.words.length }} คำ · {{ group.words.slice(0, 3).map(w => w.word).join(", ") || "ยังไม่มีคำศัพท์" }}</small>
            </button>
          </div>
          <p v-if="!visibleGroups.length" class="vocab-muted">ไม่พบกลุ่มที่ตรงกับการค้นหา</p>
        </aside>
        <section class="card vocab-detail">
          <template v-if="selectedGroup">
            <div class="vocab-section-heading">
              <div>
                <p class="eyebrow dark">SYNONYM GROUP</p>
                <h2>{{ selectedGroup.name }}</h2>
                <p class="vocab-muted">{{ selectedGroup.description || "คำศัพท์ในกลุ่มมีความหมายใกล้เคียงกัน แต่มีความต่างด้านการใช้" }}</p>
              </div>
              <div class="vocab-tools">
                <button class="light" :disabled="busy" @click="startGroupEdit">แก้ไขกลุ่ม</button>
                <button class="vocab-danger-light" :disabled="busy" @click="run(removeGroup)">ลบกลุ่ม</button>
              </div>
            </div>
            <form v-if="editGroup" class="vocab-edit-card" @submit.prevent="run(saveGroup)">
              <label>ชื่อกลุ่ม<input v-model="groupEdit.name" required maxlength="100" /></label>
              <label>คำอธิบาย<input v-model="groupEdit.description" maxlength="1000" /></label>
              <div class="actions"><button :disabled="busy">บันทึก</button><button class="light" type="button" @click="editGroup = false">ยกเลิก</button></div>
            </form>
            <div class="vocab-section-heading vocab-words-title">
              <h3>คำศัพท์ในกลุ่ม ({{ selectedGroup.words.length }})</h3>
              <button :disabled="busy" @click="startWord">+ เพิ่มคำศัพท์</button>
            </div>
            <div class="vocab-word-grid">
              <article v-for="word in selectedGroup.words" :key="word.id" class="vocab-word-card">
                <div class="vocab-word-top">
                  <span class="vocab-pos">{{ partNames[word.partOfSpeech] }}</span>
                  <span class="vocab-muted">{{ Date.parse(word.dueAt) <= Date.now() ? "ถึงเวลาทบทวน" : "มีนัดทบทวน" }}</span>
                </div>
                <div class="vocab-answer-line">
                  <h3>{{ word.word }}</h3>
                  <button class="light" type="button" @click="pronounce(word.word)" aria-label="ฟังคำศัพท์">🔊</button>
                </div>
                <p v-if="word.pronunciation" class="vocab-muted">/{{ word.pronunciation }}/</p>
                <p><strong>{{ word.meaning }}</strong></p>
                <p v-if="word.nuance" class="vocab-nuance">{{ word.nuance }}</p>
                <blockquote v-if="word.example">{{ word.example }}<small v-if="word.exampleTranslation">{{ word.exampleTranslation }}</small></blockquote>
                <div class="vocab-synonyms" v-if="selectedGroup.words.length > 1">
                  <span>Synonyms:</span>
                  <span v-for="other in selectedGroup.words.filter(w => w.id !== word.id)" :key="other.id" class="vocab-token">{{ other.word }}</span>
                </div>
                <div class="vocab-word-actions">
                  <button class="light" :disabled="busy" @click="startEditWord(word)">แก้ไข</button>
                  <button class="vocab-danger-light" :disabled="busy" @click="run(() => removeWord(word))">ลบ</button>
                </div>
              </article>
            </div>
            <div v-if="!selectedGroup.words.length" class="vocab-empty">
              <p>ยังไม่มีคำศัพท์ ลองเริ่มเพิ่มคำแรกแล้วใส่คำที่แปลใกล้กันต่อได้เลย</p>
            </div>
            <form v-if="showWordForm" class="vocab-edit-card vocab-word-form" @submit.prevent="run(saveWord)">
              <h3>{{ editWordId ? "แก้ไขคำศัพท์" : "เพิ่มคำศัพท์ในกลุ่ม" }}</h3>
              <div class="vocab-form-grid">
                <label>คำศัพท์ภาษาอังกฤษ<input v-model="wordDraft.word" required maxlength="120" placeholder="delighted" /></label>
                <label>คำแปล / ความหมายเฉพาะ<input v-model="wordDraft.meaning" required maxlength="500" placeholder="ยินดีอย่างมาก" /></label>
                <label>ชนิดของคำ
                  <select v-model="wordDraft.partOfSpeech">
                    <option v-for="(name, key) in partNames" :key="key" :value="key">{{ name }}</option>
                  </select>
                </label>
                <label>คำอ่าน / IPA (ถ้ามี)<input v-model="wordDraft.pronunciation" maxlength="120" placeholder="dɪˈlaɪ.tɪd" /></label>
              </div>
              <label>บริบทและความต่างจาก Synonyms
                <textarea v-model="wordDraft.nuance" maxlength="1200" placeholder="ความดีใจที่มีระดับสูงกว่า glad; เหมาะกับการแสดงความยินดี"></textarea>
              </label>
              <label>ตัวอย่างประโยค<input v-model="wordDraft.example" maxlength="1200" placeholder="I'm delighted to meet you." /></label>
              <label>คำแปลตัวอย่าง<input v-model="wordDraft.exampleTranslation" maxlength="1200" placeholder="ฉันยินดีมากที่ได้พบคุณ" /></label>
              <div class="actions">
                <button :disabled="busy">{{ editWordId ? "บันทึกการแก้ไข" : "บันทึกคำศัพท์" }}</button>
                <button class="light" type="button" @click="closeWordForm">ยกเลิก</button>
              </div>
            </form>
          </template>
          <div v-else class="vocab-empty">
            <h2>{{ groups.length ? "เลือกกลุ่มคำศัพท์" : "เริ่มจากสร้างกลุ่มความหมาย" }}</h2>
            <p>{{ groups.length ? "เลือกกลุ่มทางซ้าย หรือแก้คำค้นหาเพื่อแสดงผล" : "สร้างกลุ่มแรกด้านบน แล้วเพิ่มคำศัพท์ที่เป็น Synonyms" }}</p>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>
