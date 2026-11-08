import "reflect-metadata";

import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { Payload } from "./ai/queue";
import { ask, verifyQuestions, verifyFeedback, plan } from "./ai/provider";
import { minutes } from "./engine";
import { selectUniqueQuestions } from "./question-dedupe";

export async function processJob(
  db: PrismaClient,
  job: { name: string; id?: string; data: Payload },
) {
  const { userId, resourceId, section } = job.data;
  if (job.name === "generate") {
    const src = await db.source.findFirstOrThrow({
      where: { id: resourceId, topic: { goal: { userId } } },
      include: { topic: true },
    });
    const excerpt = src.chunks[section];
    const batch = verifyQuestions(
      await ask("generate", { topic: src.topic.title, excerpt }),
      excerpt,
    );
    // Serialize AI generators for the same topic. Query AFTER acquiring the lock
    // so two concurrent jobs cannot save the same normalized question.
    return db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${src.topicId}))`;
      const existing = await tx.question.findMany({
        where: { topicId: src.topicId },
        select: { prompt: true },
      });
      const unique = selectUniqueQuestions(
        existing.map((q) => q.prompt),
        batch,
      );
      const items = unique.map((q, i) => {
        const h = createHash("sha256")
          .update(job.id + "-" + i)
          .digest("hex");
        const id =
          h.slice(0, 8) +
          "-" +
          h.slice(8, 12) +
          "-4" +
          h.slice(13, 16) +
          "-a" +
          h.slice(17, 20) +
          "-" +
          h.slice(20, 32);
        return { ...q, id, topicId: src.topicId, sourceId: src.id };
      });
      const inserted = items.length
        ? await tx.question.createMany({ data: items, skipDuplicates: true })
        : { count: 0 };
      return { count: inserted.count, skipped: batch.length - inserted.count };
    });
  }
  if (job.name === "tutor") {
    const a = await db.attempt.findFirstOrThrow({
      where: { id: resourceId, question: { topic: { goal: { userId } } } },
      include: { question: true },
    });
    if (a.feedback) return a.feedback;
    const q = a.question,
      reference = [q.key, q.quote].filter(Boolean).join("\n");
    const result = verifyFeedback(
      await ask("tutor", {
        prompt: q.prompt,
        answer: a.answer,
        reference,
        rubric: q.rubric || "ความถูกต้อง ความครบถ้วน และการอธิบายเหตุผล",
      }),
      reference,
    );
    await db.attempt.update({
      where: { id: a.id },
      data: { feedback: result },
    });
    return result;
  }
  if (job.name === "planner") {
    const topic = await db.topic.findFirstOrThrow({
      where: { id: resourceId, goal: { userId } },
      include: { goal: true, incoming: { include: { source: true } } },
    });
    const recent = await db.attempt.findMany({
      where: { question: { topic: { goalId: topic.goalId } } },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        rating: true,
        confidence: true,
        question: {
          select: { kind: true, topic: { select: { title: true } } },
        },
      },
    });
    return plan.parse(
      await ask("planner", {
        goal: topic.goal.title,
        domain: topic.goal.domain,
        topic: topic.title,
        prerequisites: topic.incoming
          .filter((l) => l.kind === "prerequisite")
          .map((l) => l.source.title),
        recent,
        phaseMinutes: minutes(job.data.minutes),
      }),
    );
  }
  throw Error("Unknown job");
}
