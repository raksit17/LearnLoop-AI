<script setup lang="ts">
const {
    data,
    goalId,
    topicId,
    qId,
    page,
    topics,
    health,
    message,
    api,
    refresh,
  } = useLoop(),
  { run, busy } = useAction();
const ready = ref(false),
  signup = ref(false),
  name = ref(""),
  email = ref(""),
  password = ref("");
const tabs = [
  ["home", "ภาพรวม"],
  ["learn", "ห้องเรียน"],
  ["recall", "ฝึกจำ"],
  ["graph", "แผนผัง"],
  ["manage", "จัดการข้อมูล"],
];
onMounted(async () => {
  try {
    health.value = await api("health");
    await refresh();
  } catch (e: any) {
    if (e.message !== "กรุณาเข้าสู่ระบบ") message.value = e.message;
  } finally {
    ready.value = true;
  }
});
function auth() {
  run(async () => {
    await api(signup.value ? "register" : "login", {
      name: name.value,
      email: email.value,
      password: password.value,
    });
    password.value = "";
    await refresh();
  });
}
function changeGoal() {
  topicId.value = topics.value[0]?.id || "";
  qId.value = "";
}
async function logout() {
  await api("logout", {});
  data.value = null;
  goalId.value = topicId.value = qId.value = "";
  page.value = "home";
  message.value = "";
}
</script>
<template>
  <div v-if="message" role="alert" class="notice">
    {{ message }} <button class="light" @click="message = ''">ปิด</button>
  </div>
  <div v-if="!ready" class="shell">กำลังเปิดสมุดเรียนรู้…</div>
  <div v-else-if="!data" class="signin">
    <section class="cover">
      <div class="brand">∞ LearnLoop</div>
      <div>
        <p class="eyebrow">PERSONAL LEARNING JOURNAL</p>
        <h1>เรียนให้เข้าใจ<br />จำให้ได้นาน</h1>
        <p>เก็บบทเรียน ฝึกตอบ และให้ AI ช่วยหาจุดที่ยังอธิบายได้ไม่ชัด</p>
      </div>
    </section>
    <form class="card" @submit.prevent="auth">
      <h2>{{ signup ? "สร้างบัญชีผู้เรียน" : "กลับเข้าห้องเรียน" }}</h2>
      <label v-if="signup"
        >ชื่อผู้เรียน<input v-model="name" required maxlength="100" /></label
      ><label>อีเมล<input type="email" required v-model="email" /></label
      ><label
        >รหัสผ่าน<input
          type="password"
          v-model="password"
          required
          minlength="8"
          maxlength="200" /></label
      ><button :disabled="busy">
        {{ signup ? "สมัครและเริ่มเรียน" : "เข้าสู่ระบบ" }}
      </button>
      <button type="button" class="light" @click="signup = !signup">
        {{ signup ? "มีบัญชีแล้ว" : "สมัครบัญชีใหม่" }}
      </button>
      <p v-if="health.oidc"><a href="/v1/oidc">เข้าสู่ระบบผ่านองค์กร</a></p>
    </form>
  </div>
  <div v-else class="layout">
    <aside>
      <div class="brand">∞ LearnLoop</div>
      <nav>
        <button
          v-for="[key, label] in tabs"
          :key="key"
          :class="{ selected: page === key }"
          @click="page = key"
        >
          {{ label }}
        </button>
      </nav>
      <footer>
        {{ data.user.name }}
        <span v-if="health.demo" class="demo-label">โหมดทดลอง (ไม่ต้องเข้าสู่ระบบ)</span>
        <button v-else class="light" @click="run(logout)">ออก</button>
      </footer>
    </aside>
    <main>
      <header>
        <span>สมุดเรียนรู้ส่วนตัว</span>
        <div class="header-controls">
          <select v-if="data.goals.length" aria-label="เป้าหมาย" v-model="goalId" @change="changeGoal">
            <option v-for="g in data.goals" :key="g.id" :value="g.id">{{ g.title }}</option>
          </select>
          <span v-else>ยังไม่มีเป้าหมายการเรียน</span>
          <button class="light" @click="page = 'manage'">จัดการเป้าหมายและหัวข้อ</button>
        </div>
      </header>
      <LearningManager v-if="page === 'manage' || !goalId" />
      <template v-else>
        <Dashboard v-if="page === 'home'" />
        <Workspace v-else-if="page === 'learn'" :key="goalId" />
        <Recall v-else-if="page === 'recall'" :key="goalId" />
        <KnowledgeGraph v-else-if="page === 'graph'" :key="goalId" />
      </template>
    </main>
  </div>
</template>
