<script setup lang="ts">
type Section = { heading: string; explanation: string; bullets: string[] };
type Glossary = { term: string; meaning: string };
defineProps<{
  aid: {
    title: string;
    summary: string;
    sections: Section[];
    keyPoints: string[];
    glossary: Glossary[];
  };
  summaryOnly?: boolean;
}>();
</script>

<template>
  <div class="reading-aid">
    <div class="reading-intro">
      <p class="eyebrow dark">AI READING AID</p>
      <h3>{{ aid.title }}</h3>
      <p>{{ aid.summary }}</p>
    </div>
    <section v-if="!summaryOnly" class="reading-section-list">
      <article v-for="(part, index) in aid.sections" :key="index" class="reading-section">
        <h4>{{ index + 1 }}. {{ part.heading }}</h4>
        <p>{{ part.explanation }}</p>
        <ul>
          <li v-for="(item, i) in part.bullets" :key="i">{{ item }}</li>
        </ul>
      </article>
    </section>
    <section class="reading-key-points">
      <h4>สิ่งที่ต้องจำ</h4>
      <ul><li v-for="(point, i) in aid.keyPoints" :key="i">{{ point }}</li></ul>
    </section>
    <section v-if="aid.glossary.length" class="reading-glossary">
      <h4>คำศัพท์สำคัญ</h4>
      <dl>
        <div v-for="(item, i) in aid.glossary" :key="i">
          <dt>{{ item.term }}</dt>
          <dd>{{ item.meaning }}</dd>
        </div>
      </dl>
    </section>
  </div>
</template>
