// One-time import from the local LearnLoop SQLite edition.
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { chunks, minutes, phases } from "./engine";
const db = new PrismaClient();
const legacyId = (table: string, n: number) => {
  const h = createHash("sha256")
    .update("learnloop-v1/" + table + "/" + n)
    .digest("hex");
  return (
    h.slice(0, 8) +
    "-" +
    h.slice(8, 12) +
    "-4" +
    h.slice(13, 16) +
    "-9" +
    h.slice(17, 20) +
    "-" +
    h.slice(20, 32)
  );
};
async function importFile() {
  if (!process.argv[2]) throw Error("Pass the path to learnloop.sqlite");
  const sqlite = new DatabaseSync(process.argv[2], { readOnly: true });
  const rows = (t: string) =>
    sqlite.prepare("SELECT * FROM " + t + " ORDER BY rowid").all() as Record<
      string,
      any
    >[];
  try {
    await db.$transaction(
      async (tx) => {
        for (const u of rows("users")) {
          const id = legacyId("users", u.id),
            identity = "email:" + u.email.toLowerCase();
          const existing = await tx.user.findFirst({
            where: { OR: [{ identity }, { id }] },
          });
          if (
            existing &&
            (existing.id !== id || existing.identity !== identity)
          )
            throw Error("Account conflict. Import into a new database.");
          await tx.user.upsert({
            where: { id },
            update: {},
            create: {
              id,
              identity,
              name: u.name,
              password: u.salt + ":" + u.hash,
            },
          });
        }
        for (const g of rows("goals")) {
          const id = legacyId("goals", g.id);
          await tx.goal.upsert({
            where: { id },
            update: {},
            create: {
              id,
              userId: legacyId("users", g.user),
              domain: "General",
              title: g.title,
            },
          });
        }
        for (const t of rows("topics")) {
          const id = legacyId("topics", t.id);
          await tx.topic.upsert({
            where: { id },
            update: {},
            create: {
              id,
              goalId: legacyId("goals", t.goal),
              title: t.title,
              notes: t.notes,
            },
          });
        }
        for (const s of rows("sources")) {
          const id = legacyId("sources", s.id);
          await tx.source.upsert({
            where: { id },
            update: {},
            create: {
              id,
              topicId: legacyId("topics", s.topic),
              title: s.title,
              chunks: chunks(s.body),
            },
          });
        }
        for (const q of rows("questions")) {
          const id = legacyId("questions", q.id);
          await tx.question.upsert({
            where: { id },
            update: {},
            create: {
              id,
              topicId: legacyId("topics", q.topic),
              prompt: q.prompt,
              key: q.key,
              hint: q.hint,
              kind: q.kind,
              days: q.days,
              dueAt: new Date(q.due),
            },
          });
        }
        const ratings = new Map(rows("reviews").map((r) => [r.attempt, r]));
        for (const a of rows("attempts")) {
          const id = legacyId("attempts", a.id),
            r = ratings.get(a.id);
          await tx.attempt.upsert({
            where: { id },
            update: {},
            create: {
              id,
              questionId: legacyId("questions", a.q),
              answer: a.answer,
              confidence: a.confidence,
              hint: !!a.hint,
              seconds: a.seconds,
              createdAt: new Date(a.stamp),
              request: legacyId("request", a.id),
              rating: r?.rating,
              nextDue: r ? new Date(r.due) : null,
            },
          });
        }
        for (const l of rows("links")) {
          const id = legacyId("links", l.id);
          await tx.link.upsert({
            where: { id },
            update: {},
            create: {
              id,
              src: legacyId("topics", l.src),
              dst: legacyId("topics", l.dst),
              kind: l.kind,
            },
          });
        }
        for (const s of rows("sessions")) {
          const id = legacyId("sessions", s.id),
            times = minutes(s.minutes);
          await tx.studySession.upsert({
            where: { id },
            update: {},
            create: {
              id,
              topicId: legacyId("topics", s.topic),
              plan: phases.map((name, i) => ({
                name,
                instruction: name,
                minutes: times[i],
                questionId: null,
              })),
              step: s.step,
              stepStart: new Date(s.stepStart),
              finished: !!s.finished,
            },
          });
        }
      },
      { timeout: 120000 },
    );
    console.log("Import complete");
  } finally {
    sqlite.close();
  }
}
importFile()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
