<script setup lang="ts">
type ItemKind = "goal" | "topic";
type EditItem = { kind: ItemKind; id: string; title: string; domain: string } | null;
type DeleteItem = { kind: ItemKind; id: string; title: string } | null;

const {
  data, goalId, topicId, qId, page, api, refresh, message,
} = useLoop();
const { busy, run } = useAction();

const tab = ref<ItemKind>("goal");
const search = ref("");
const sort = ref("title");
const topicFilter = ref("all");
const goalTitle = ref("");
const goalDomain = ref("General");
const topicTitle = ref("");
const topicGoal = ref("");
const edit = ref<EditItem>(null);
const removal = ref<DeleteItem>(null);
const confirmation = ref("");

const goals = computed<any[]>(() => data.value?.goals || []);
const allTopics = computed<any[]>(() => data.value?.topics || []);
const allSources = computed<any[]>(() => data.value?.sources || []);
const allQuestions = computed<any[]>(() => data.value?.questions || []);
const allAttempts = computed<any[]>(() => data.value?.attempts || []);
const allSessions = computed<any[]>(() => data.value?.sessions || []);

function goalName(id: string) {
  return goals.value.find((g: any) => g.id === id)?.title || "ไม่พบเป้าหมาย";
}
function impact(topicIds: string[]) {
  const ids = new Set(topicIds);
  const questionIds = new Set(allQuestions.value.filter(q => ids.has(q.topicId)).map(q => q.id));
  return {
    topics: ids.size,
    sources: allSources.value.filter(s => ids.has(s.topicId)).length,
    questions: questionIds.size,
    attempts: allAttempts.value.filter(a => questionIds.has(a.questionId)).length,
    sessions: allSessions.value.filter(s => ids.has(s.topicId)).length,
  };
}
function goalImpact(id: string) {
  return impact(allTopics.value.filter(t => t.goalId === id).map(t => t.id));
}
function topicImpact(id: string) {
  return impact([id]);
}
const deletionImpact = computed(() =>
  removal.value
    ? removal.value.kind === "goal"
      ? goalImpact(removal.value.id)
      : topicImpact(removal.value.id)
    : null
);
const normalizedSearch = computed(() => search.value.trim().toLocaleLowerCase());
function order<T extends { title: string }>(records: T[]): T[] {
  return [...records].sort((a, b) =>
    sort.value === "reverse"
      ? b.title.localeCompare(a.title, "th")
      : a.title.localeCompare(b.title, "th")
  );
}
const visibleGoals = computed(() =>
  order(goals.value.filter(g =>
    (g.title + " " + g.domain).toLocaleLowerCase().includes(normalizedSearch.value)
  )),
);
const visibleTopics = computed(() =>
  order(allTopics.value.filter(t =>
    (topicFilter.value === "all" || t.goalId === topicFilter.value) &&
    (t.title + " " + goalName(t.goalId)).toLocaleLowerCase().includes(normalizedSearch.value)
  )),
);

function selectTab(kind: ItemKind) {
  tab.value = kind;
  search.value = "";
  sort.value = "title";
  edit.value = null;
  removal.value = null;
  confirmation.value = "";
}
function beginEdit(kind: ItemKind, item: any) {
  edit.value = {
    kind, id: item.id, title: item.title, domain: item.domain || "General",
  };
  removal.value = null;
}
function beginDelete(kind: ItemKind, item: any) {
  edit.value = null;
  confirmation.value = "";
  removal.value = { kind, id: item.id, title: item.title };
}
function cancelDelete() {
  removal.value = null;
  confirmation.value = "";
}
async function createGoal() {
  const g = await api("goals", {
    title: goalTitle.value.trim(), domain: goalDomain.value,
  });
  goalTitle.value = "";
  await refresh();
  goalId.value = g.id;
  message.value = "สร้างเป้าหมายใหม่เรียบร้อย";
}
async function createTopic() {
  const g = topicGoal.value || goalId.value;
  const t = await api("topics", { goalId: g, title: topicTitle.value.trim() });
  topicTitle.value = "";
  await refresh();
  goalId.value = g;
  topicId.value = t.id;
  message.value = "สร้างหัวข้อใหม่เรียบร้อย";
}
async function saveEdit() {
  if (!edit.value) return;
  const row = { ...edit.value };
  if (row.kind === "goal") {
    await api("goals/" + row.id, {
      title: row.title.trim(), domain: row.domain,
    }, "PATCH");
  } else {
    await api("topics/" + row.id, { title: row.title.trim() }, "PATCH");
  }
  edit.value = null;
  await refresh();
  message.value = "บันทึกการแก้ไขเรียบร้อย";
}
async function confirmDelete() {
  if (!removal.value || confirmation.value !== removal.value.title) return;
  const target = { ...removal.value };
  const impactedTopicIds = target.kind === "goal"
    ? allTopics.value.filter(t => t.goalId === target.id).map(t => t.id)
    : [target.id];
  await api(
    (target.kind === "goal" ? "goals/" : "topics/") + target.id,
    { confirmTitle: confirmation.value },
    "DELETE",
  );
  for (const id of impactedTopicIds) {
    localStorage.removeItem(["ll-note", data.value.user.id, id].join(":"));
  }
  qId.value = "";
  cancelDelete();
  await refresh();
  message.value = `ลบ${target.kind === "goal" ? "เป้าหมาย" : "หัวข้อ"} “${target.title}” แล้ว`;
}
function goToTopic(t: any) {
  goalId.value = t.goalId;
  topicId.value = t.id;
  qId.value = "";
  page.value = "learn";
}
function useGoal(g: any) {
  goalId.value = g.id;
  topicId.value = allTopics.value.find(t => t.goalId === g.id)?.id || "";
  qId.value = "";
  page.value = "home";
}
watch(() => goals.value.map(g => g.id).join(","), () => {
  if (topicFilter.value !== "all" && !goals.value.some(g => g.id === topicFilter.value))
    topicFilter.value = "all";
  if (topicGoal.value && !goals.value.some(g => g.id === topicGoal.value))
    topicGoal.value = "";
});
</script>

<template>
  <section class="manage-page">
    <p class="eyebrow dark">LEARNING DATA MANAGEMENT</p>
    <h1>จัดการข้อมูลการเรียน</h1>
    <p class="manage-intro">จัดการเป้าหมายและหัวข้อได้ในที่เดียว ทั้งสร้างใหม่ แก้ไขชื่อ ค้นหา และลบข้อมูลที่ไม่ต้องการ</p>

    <div class="manage-stats">
      <div><span>เป้าหมาย</span><strong>{{ goals.length }}</strong></div>
      <div><span>หัวข้อ</span><strong>{{ allTopics.length }}</strong></div>
      <div><span>แหล่งเรียน</span><strong>{{ allSources.length }}</strong></div>
      <div><span>คำถาม</span><strong>{{ allQuestions.length }}</strong></div>
    </div>

    <section class="card manage-card">
      <div class="manage-header">
        <div>
          <h2>รายการข้อมูล</h2>
          <p>เลือกประเภทข้อมูลที่ต้องการจัดการ</p>
        </div>
        <div class="manage-tabs" role="tablist" aria-label="ประเภทข้อมูล">
          <button type="button" role="tab" :aria-selected="tab === 'goal'"
            :class="{ selected: tab === 'goal' }" @click="selectTab('goal')">
            เป้าหมาย ({{ goals.length }})
          </button>
          <button type="button" role="tab" :aria-selected="tab === 'topic'"
            :class="{ selected: tab === 'topic' }" @click="selectTab('topic')">
            หัวข้อ ({{ allTopics.length }})
          </button>
        </div>
      </div>

      <form v-if="tab === 'goal'" class="manage-create" @submit.prevent="run(createGoal)">
        <h3>+ เพิ่มเป้าหมายการเรียน</h3>
        <div class="manage-create-fields">
          <label>ชื่อเป้าหมาย
            <input v-model="goalTitle" required maxlength="500" placeholder="เช่น เตรียมสัมภาษณ์ Backend Developer" />
          </label>
          <label>ประเภท
            <select v-model="goalDomain">
              <option value="General">ทั่วไป</option>
              <option value="Programming">Programming</option>
              <option value="English">English</option>
            </select>
          </label>
          <button type="submit" :disabled="busy">สร้างเป้าหมาย</button>
        </div>
      </form>
      <form v-else class="manage-create" @submit.prevent="run(createTopic)">
        <h3>+ เพิ่มหัวข้อการเรียน</h3>
        <div class="manage-create-fields">
          <label>ชื่อหัวข้อ
            <input v-model="topicTitle" required maxlength="500" placeholder="เช่น TypeScript, Database Index" />
          </label>
          <label>เป้าหมายที่สังกัด
            <select v-model="topicGoal" required>
              <option value="" disabled>เลือกเป้าหมาย</option>
              <option v-for="g in goals" :key="g.id" :value="g.id">{{ g.title }}</option>
            </select>
          </label>
          <button type="submit" :disabled="busy || !goals.length">เพิ่มหัวข้อ</button>
        </div>
      </form>

      <div class="manage-toolbar">
        <label>ค้นหา
          <input v-model="search" type="search" placeholder="พิมพ์ชื่อที่ต้องการค้นหา" />
        </label>
        <label v-if="tab === 'topic'">กรองตามเป้าหมาย
          <select v-model="topicFilter">
            <option value="all">ทุกเป้าหมาย</option>
            <option v-for="g in goals" :key="g.id" :value="g.id">{{ g.title }}</option>
          </select>
        </label>
        <label>เรียงตามชื่อ
          <select v-model="sort">
            <option value="title">ก → ฮ / A → Z</option>
            <option value="reverse">ฮ → ก / Z → A</option>
          </select>
        </label>
      </div>

      <p class="manage-results" aria-live="polite">
        พบ {{ tab === "goal" ? visibleGoals.length : visibleTopics.length }} รายการ
      </p>
      <div class="manage-table-scroll">
        <table class="manage-table">
          <thead v-if="tab === 'goal'">
            <tr>
              <th scope="col">ชื่อเป้าหมาย</th>
              <th scope="col">ประเภท</th>
              <th scope="col">หัวข้อ</th>
              <th scope="col">แหล่งเรียน / คำถาม</th>
              <th scope="col">จัดการ</th>
            </tr>
          </thead>
          <thead v-else>
            <tr>
              <th scope="col">ชื่อหัวข้อ</th>
              <th scope="col">เป้าหมาย</th>
              <th scope="col">แหล่งเรียน</th>
              <th scope="col">คำถาม / รอบเรียน</th>
              <th scope="col">จัดการ</th>
            </tr>
          </thead>
          <tbody v-if="tab === 'goal'">
            <template v-for="g in visibleGoals" :key="g.id">
              <tr :class="{ 'manage-current': goalId === g.id }">
                <td><strong>{{ g.title }}</strong><small v-if="goalId === g.id">กำลังเลือก</small></td>
                <td>{{ g.domain }}</td>
                <td>{{ goalImpact(g.id).topics }}</td>
                <td>{{ goalImpact(g.id).sources }} / {{ goalImpact(g.id).questions }}</td>
                <td><div class="manage-row-actions">
                  <button type="button" class="light" @click="useGoal(g)">เปิด</button>
                  <button type="button" class="light" @click="beginEdit('goal', g)">แก้ไข</button>
                  <button type="button" class="manage-danger-text" @click="beginDelete('goal', g)">ลบ</button>
                </div></td>
              </tr>
              <tr v-if="edit?.kind === 'goal' && edit.id === g.id" class="manage-editor-row">
                <td colspan="5">
                  <form class="manage-edit-form" @submit.prevent="run(saveEdit)">
                    <h3>แก้ไขเป้าหมาย</h3>
                    <label>ชื่อเป้าหมาย
                      <input v-model="edit.title" required maxlength="500" />
                    </label>
                    <label>ประเภท
                      <select v-model="edit.domain">
                        <option value="General">ทั่วไป</option>
                        <option value="Programming">Programming</option>
                        <option value="English">English</option>
                      </select>
                    </label>
                    <div class="manage-row-actions">
                      <button type="submit" :disabled="busy">บันทึก</button>
                      <button type="button" class="light" @click="edit = null">ยกเลิก</button>
                    </div>
                  </form>
                </td>
              </tr>
            </template>
          </tbody>
          <tbody v-else>
            <template v-for="t in visibleTopics" :key="t.id">
              <tr :class="{ 'manage-current': topicId === t.id }">
                <td><strong>{{ t.title }}</strong><small v-if="topicId === t.id">กำลังเลือก</small></td>
                <td>{{ goalName(t.goalId) }}</td>
                <td>{{ topicImpact(t.id).sources }}</td>
                <td>{{ topicImpact(t.id).questions }} / {{ topicImpact(t.id).sessions }}</td>
                <td><div class="manage-row-actions">
                  <button type="button" class="light" @click="goToTopic(t)">เปิด</button>
                  <button type="button" class="light" @click="beginEdit('topic', t)">แก้ไข</button>
                  <button type="button" class="manage-danger-text" @click="beginDelete('topic', t)">ลบ</button>
                </div></td>
              </tr>
              <tr v-if="edit?.kind === 'topic' && edit.id === t.id" class="manage-editor-row">
                <td colspan="5">
                  <form class="manage-edit-form" @submit.prevent="run(saveEdit)">
                    <h3>แก้ไขหัวข้อ</h3>
                    <label>ชื่อหัวข้อ
                      <input v-model="edit.title" required maxlength="500" />
                    </label>
                    <div class="manage-row-actions">
                      <button type="submit" :disabled="busy">บันทึก</button>
                      <button type="button" class="light" @click="edit = null">ยกเลิก</button>
                    </div>
                  </form>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
      <p v-if="!(tab === 'goal' ? visibleGoals.length : visibleTopics.length)" class="manage-empty">
        {{ search ? "ไม่พบรายการตามคำค้นหา" : "ยังไม่มีรายการประเภทนี้" }}
      </p>

      <section v-if="removal && deletionImpact" class="manage-delete-confirm" role="region" aria-label="ยืนยันการลบข้อมูล">
        <h3>ยืนยันการลบ {{ removal.kind === "goal" ? "เป้าหมาย" : "หัวข้อ" }} “{{ removal.title }}”</h3>
        <p>การลบนี้<strong>ไม่สามารถกู้คืนจากหน้าเว็บได้</strong> และจะลบข้อมูลที่เกี่ยวข้องต่อไปนี้ด้วย:</p>
        <div class="manage-impact">
          <span>หัวข้อ {{ removal.kind === "goal" ? deletionImpact.topics : 1 }}</span>
          <span>บทเรียน {{ deletionImpact.sources }}</span>
          <span>คำถาม {{ deletionImpact.questions }}</span>
          <span>ประวัติคำตอบ {{ deletionImpact.attempts }}</span>
          <span>รอบเรียน {{ deletionImpact.sessions }}</span>
        </div>
        <form @submit.prevent="run(confirmDelete)">
          <label>พิมพ์ชื่อ <strong>{{ removal.title }}</strong> เพื่อยืนยัน
            <input v-model="confirmation" :placeholder="removal.title" autocomplete="off" required />
          </label>
          <div class="manage-row-actions">
            <button type="submit" class="manage-danger" :disabled="busy || confirmation !== removal.title">
              ลบข้อมูลถาวร
            </button>
            <button type="button" class="light" @click="cancelDelete">ยกเลิก</button>
          </div>
        </form>
      </section>
    </section>
  </section>
</template>
