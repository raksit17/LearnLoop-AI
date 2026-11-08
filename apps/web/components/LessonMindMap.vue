<script setup lang="ts">
defineProps<{
  map: {
    root: string;
    branches: { label: string; children: string[] }[];
  };
}>();
</script>

<template>
  <section class="mindmap" aria-label="แผนผังความคิดจากบทเรียน">
    <div class="mindmap-root">{{ map.root }}</div>
    <div class="mindmap-branches">
      <article v-for="(branch, i) in map.branches" :key="i" class="mindmap-branch">
        <h4>{{ branch.label }}</h4>
        <ul>
          <li v-for="(child, j) in branch.children" :key="j">{{ child }}</li>
        </ul>
      </article>
    </div>
  </section>
</template>
