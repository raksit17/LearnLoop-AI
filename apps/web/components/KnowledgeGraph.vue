<script setup lang="ts">
const { topics, data, topicId, api, refresh, openTopic, attempts, questions } =
    useLoop(),
  { busy, run } = useAction();
const dst = ref(""),
  kind = ref("related"),
  filter = ref("all"),
  search = ref(""),
  zoom = ref(1);
const names: Record<string, string> = {
  prerequisite: "พื้นฐานก่อนเรียน",
  related: "เกี่ยวข้อง",
  part_of: "เป็นส่วนหนึ่งของ",
};
const nodes = computed(() =>
  topics.value.map((t: any, i: number) => ({
    ...t,
    x: 118 + (i % 3) * 240,
    y: 55 + Math.floor(i / 3) * 120,
  })),
);
const byId = (id: string) => nodes.value.find((n: any) => n.id === id);
const links = computed(() =>
  data.value.links.filter(
    (l: any) =>
      byId(l.src) &&
      byId(l.dst) &&
      (filter.value === "all" || l.kind === filter.value),
  ),
);
const height = computed(() =>
  Math.max(170, Math.ceil(nodes.value.length / 3) * 120),
);
const weak = (id: string) =>
  questions.value.some((q: any) => {
    if (q.topicId !== id) return false;
    const a = attempts.value.find(
      (a: any) => a.questionId === q.id && (a.feedback || a.rating),
    );
    return a && (a.feedback?.score < 0.5 || (a.rating && a.rating <= 2));
  });
async function connect() {
  await api("links", { src: topicId.value, dst: dst.value, kind: kind.value });
  await refresh();
}
</script>
<template>
  <p class="eyebrow dark">KNOWLEDGE GRAPH</p>
  <h1>แผนผังความรู้</h1>
  <section class="card">
    <div class="actions">
      <label>ค้นหา<input v-model="search" type="search" /></label
      ><label
        >ประเภทเส้น<select v-model="filter">
          <option value="all">ทั้งหมด</option>
          <option v-for="(v, k) in names" :value="k">{{ v }}</option>
        </select></label
      >
    </div>
    <p v-if="!nodes.length">เพิ่มหัวข้อในห้องเรียนเพื่อเริ่มแผนผัง</p>
    <div class="graph">
      <svg
        :viewBox="'0 0 720 ' + height"
        :width="720 * zoom"
        :height="height * zoom"
      >
        <defs>
          <marker
            id="arrow"
            markerWidth="6"
            markerHeight="6"
            refX="5"
            refY="3"
            orient="auto"
          >
            <path d="M0 0 L6 3 L0 6Z" fill="#69806a" />
          </marker>
        </defs>
        <path
          v-for="l in links"
          :d="
            'M ' +
            byId(l.src).x +
            ' ' +
            (byId(l.src).y + 20) +
            ' Q ' +
            (byId(l.src).x + byId(l.dst).x) / 2 +
            ' ' +
            (byId(l.src).y + 72) +
            ' ' +
            byId(l.dst).x +
            ' ' +
            (byId(l.dst).y + 20)
          "
          stroke="#69806a"
          fill="none"
          :stroke-dasharray="l.kind === 'related' ? '4 3' : ''"
          :marker-end="l.kind === 'related' ? '' : 'url(#arrow)'"
        />
        <g
          v-for="n in nodes"
          tabindex="0"
          role="button"
          :aria-label="n.title"
          @click="topicId = n.id"
          @keydown.enter="topicId = n.id"
          :opacity="
            n.title.toLowerCase().includes(search.toLowerCase()) ? 1 : 0.3
          "
        >
          <rect
            :x="n.x - 96"
            :y="n.y - 20"
            width="192"
            height="40"
            rx="12"
            stroke="#617d67"
            :fill="n.id === topicId ? '#d6ef87' : '#fffef9'"
          />
          <text :x="n.x" :y="n.y + 5" text-anchor="middle">
            {{ weak(n.id) ? "↻ " : "" }}{{ n.title.slice(0, 20) }}
          </text>
        </g>
      </svg>
    </div>
    <div class="actions">
      <button class="light" @click="zoom = Math.max(0.5, zoom - 0.25)">
        ย่อ</button
      ><button class="light" @click="zoom = Math.min(2, zoom + 0.25)">
        ขยาย
      </button>
    </div>
  </section>
  <section class="card" v-if="byId(topicId)">
    <h2>{{ byId(topicId).title }}</h2>
    <p v-if="weak(topicId)">↻ ควรฝึกเพิ่มจากผลครั้งล่าสุด</p>
    <div
      v-for="l in links.filter(
        (l: any) => l.src === topicId || l.dst === topicId,
      )"
      class="entry"
    >
      {{ byId(l.src).title }} → {{ names[l.kind] }} → {{ byId(l.dst).title }}
    </div>
    <button @click="openTopic(topicId)">อ่านหัวข้อนี้</button>
    <form v-if="topics.length > 1" @submit.prevent="run(connect)">
      <h3>เพิ่มความสัมพันธ์จากหัวข้อที่เลือก</h3>
      <label
        >ความสัมพันธ์<select v-model="kind">
          <option v-for="(v, k) in names" :value="k">{{ v }}</option>
        </select></label
      ><label
        >ไปยังหัวข้อ<select v-model="dst" required>
          <option
            v-for="t in topics.filter((t: any) => t.id !== topicId)"
            :value="t.id"
          >
            {{ t.title }}
          </option>
        </select></label
      ><button class="light" :disabled="busy">เชื่อมหัวข้อ</button>
    </form>
  </section>
</template>
