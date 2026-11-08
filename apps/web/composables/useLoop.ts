export function useLoop() {
  const data = useState<any>("snapshot", () => null),
    goalId = useState("goal", () => ""),
    topicId = useState("topic", () => ""),
    page = useState("page", () => "home"),
    qId = useState("question", () => ""),
    message = useState("notice", () => "");
  const health = useState("health", () => ({ ai: false, oidc: false }));
  async function api(path: string, body?: any) {
    const isFile = body instanceof FormData;
    const r = await fetch(
      "/v1/" + path,
      body === undefined
        ? {}
        : {
            method: "POST",
            headers: isFile ? {} : { "Content-Type": "application/json" },
            body: isFile ? body : JSON.stringify(body),
          },
    );
    if (!r.ok) {
      const v = await r.json().catch(() => ({}));
      if (r.status === 401 && path !== "login") {
        data.value = null;
      }
      throw Error(v.message || "เชื่อมต่อบริการไม่ได้");
    }
    return r.json();
  }
  async function refresh() {
    data.value = await api("state");
    if (!data.value.goals.some((g: any) => g.id === goalId.value))
      goalId.value = data.value.goals[0]?.id || "";
    if (!topics.value.some((t: any) => t.id === topicId.value))
      topicId.value = topics.value[0]?.id || "";
  }
  const topics = computed(
    () =>
      data.value?.topics.filter((t: any) => t.goalId === goalId.value) || [],
  );
  const questions = computed(
    () =>
      data.value?.questions.filter((q: any) =>
        topics.value.some((t: any) => t.id === q.topicId),
      ) || [],
  );
  const attempts = computed(
    () =>
      data.value?.attempts.filter((a: any) =>
        questions.value.some((q: any) => q.id === a.questionId),
      ) || [],
  );
  const active = computed(() =>
    data.value?.sessions.find((s: any) => !s.finished),
  );
  function openTopic(id: string) {
    const t = data.value.topics.find((t: any) => t.id === id);
    goalId.value = t.goalId;
    topicId.value = id;
    page.value = "learn";
  }
  function openQuestion(id: string) {
    qId.value = id;
    page.value = "recall";
  }
  async function job(
    task: string,
    resourceId: string,
    settings: Record<string, number> = {},
  ) {
    const key = [
      "ll-job",
      data.value.user.id,
      task,
      resourceId,
      JSON.stringify(settings),
    ].join(":");
    let id = localStorage.getItem(key);
    if (!id) {
      id = (await api("ai/" + task, { resourceId, ...settings })).jobId;
      localStorage.setItem(key, id!);
    }
    for (let i = 0; i < 150; i++) {
      let j;
      try {
        j = await api("ai/jobs/" + id);
      } catch (e: any) {
        if (e.message.includes("ไม่พบงาน")) localStorage.removeItem(key);
        throw e;
      }
      if (j.state === "completed") {
        localStorage.removeItem(key);
        return j.result;
      }
      if (j.state === "failed") {
        localStorage.removeItem(key);
        throw Error(j.error);
      }
      await new Promise((r) => setTimeout(r, 1200));
    }
    throw Error("งานยังอยู่ในคิว กดปุ่มเดิมเพื่อติดตามต่อ");
  }
  return {
    data,
    goalId,
    topicId,
    page,
    qId,
    message,
    health,
    topics,
    questions,
    attempts,
    active,
    api,
    refresh,
    openTopic,
    openQuestion,
    job,
  };
}
export function useAction() {
  const busy = ref(false),
    { message } = useLoop();
  async function run(fn: () => Promise<any>) {
    if (busy.value) return;
    busy.value = true;
    message.value = "";
    try {
      await fn();
    } catch (e: any) {
      message.value = e.message || "ดำเนินการไม่สำเร็จ";
    } finally {
      busy.value = false;
    }
  }
  return { busy, run };
}
