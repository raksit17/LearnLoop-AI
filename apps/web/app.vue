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
  showGoal = ref(false),
  name = ref(""),
  email = ref(""),
  password = ref(""),
  title = ref(""),
  domain = ref("General");
const tabs = [
  ["home", "ภาพรวม"],
  ["learn", "ห้องเรียน"],
  ["recall", "ฝึกจำ"],
  ["graph", "แผนผัง"],
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
function createGoal() {
  run(async () => {
    const g = await api("goals", { title: title.value, domain: domain.value });
    goalId.value = g.id;
    title.value = "";
    showGoal.value = false;
    await refresh();
    page.value = "learn";
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
        <div>
          <select aria-label="เป้าหมาย" v-model="goalId" @change="changeGoal">
            <option v-for="g in data.goals" :value="g.id">{{ g.title }}</option>
          </select>
          <button class="light" @click="showGoal = !showGoal">
            + เป้าหมาย
          </button>
        </div>
      </header>
      <form
        v-if="showGoal || !goalId"
        class="card"
        @submit.prevent="createGoal"
      >
        <h2>ตั้งเป้าหมายการเรียน</h2>
        <label
          >อยากทำอะไรได้เมื่อเรียนจบ<input required v-model="title" /></label
        ><label
          >ประเภท<select v-model="domain">
            <option>Programming</option>
            <option>English</option>
            <option value="General">วิชาอื่น ๆ</option>
          </select></label
        ><button :disabled="busy">สร้างเป้าหมาย</button>
      </form>
      <template v-if="goalId"
        ><Dashboard v-if="page === 'home'" /><Workspace
          v-else-if="page === 'learn'"
          :key="goalId" /><Recall
          v-else-if="page === 'recall'"
          :key="goalId" /><KnowledgeGraph v-else :key="goalId"
      /></template>
    </main>
  </div>
</template>
