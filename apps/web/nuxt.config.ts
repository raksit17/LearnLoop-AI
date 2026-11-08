export default defineNuxtConfig({
  ssr: false,
  devtools: { enabled: false },
  modules: ["@nuxtjs/tailwindcss"],
  css: ["~/assets/style.css"],
  app: {
    head: {
      htmlAttrs: { lang: "th" },
      title: "LearnLoop · สมุดเรียนรู้ส่วนตัว",
    },
  },
  compatibilityDate: "2025-05-15",
});
