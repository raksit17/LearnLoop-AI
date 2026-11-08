import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  UseGuards,
  Module,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { z } from "zod";
import { Database, MemberGuard, parse } from "./core";
import { chunks, hasCycle, minutes, nextReview, phases } from "./engine";
const id = z.string().uuid(),
  title = z.string().trim().min(1).max(500),
  short = z.string().trim().min(1).max(12000);
export const duration = z.union([
  z.literal(20),
  z.literal(30),
  z.literal(45),
  z.literal(60),
]);
const publicQuestion = {
  id: true,
  topicId: true,
  prompt: true,
  kind: true,
  sourceId: true,
  dueAt: true,
  days: true,
};
@Controller()
@UseGuards(MemberGuard)
export class LearningController {
  constructor(private db: Database) {}
  @Get("state") async state(@Req() req: any) {
    const userId = req.user,
      topic = { goal: { userId } };
    const [user, goals, topics, sources, questions, attempts, links, sessions] =
      await Promise.all([
        this.db.user.findUnique({
          where: { id: userId },
          select: { id: true, name: true },
        }),
        this.db.goal.findMany({ where: { userId }, orderBy: { title: "asc" } }),
        this.db.topic.findMany({ where: topic, orderBy: { title: "asc" } }),
        this.db.source.findMany({
          where: { topic },
          select: { id: true, title: true, topicId: true, chunks: true },
        }),
        this.db.question.findMany({
          where: { topic },
          select: publicQuestion,
          orderBy: { dueAt: "asc" },
        }),
        this.db.attempt.findMany({
          where: { question: { topic } },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            questionId: true,
            rating: true,
            confidence: true,
            createdAt: true,
            nextDue: true,
            feedback: true,
          },
        }),
        this.db.link.findMany({ where: { source: topic } }),
        this.db.studySession.findMany({
          where: { topic },
          orderBy: { stepStart: "desc" },
        }),
      ]);
    return {
      user,
      goals,
      topics,
      sources,
      questions,
      attempts,
      links,
      sessions,
    };
  }
  @Post("goals") goal(@Req() req: any, @Body() body: unknown) {
    const b = parse(
      z.object({
        title,
        domain: z.enum(["Programming", "English", "General"]),
      }),
      body,
    );
    return this.db.goal.create({ data: { ...b, userId: req.user } });
  }
  @Post("topics") async topic(@Req() req: any, @Body() body: unknown) {
    const b = parse(z.object({ goalId: id, title }), body);
    if (
      !(await this.db.goal.findFirst({
        where: { id: b.goalId, userId: req.user },
      }))
    )
      throw new NotFoundException();
    return this.db.topic.create({ data: b });
  }
  @Post("notes") async notes(@Req() req: any, @Body() body: unknown) {
    const b = parse(
      z.object({ topicId: id, notes: z.string().max(150000) }),
      body,
    );
    await this.db.ownedTopic(req.user, b.topicId);
    return this.db.topic.update({
      where: { id: b.topicId },
      data: { notes: b.notes },
    });
  }
  @Post("sources") async source(@Req() req: any, @Body() body: unknown) {
    const b = parse(
      z.object({
        topicId: id,
        title,
        body: z.string().trim().min(1).max(150000),
      }),
      body,
    );
    await this.db.ownedTopic(req.user, b.topicId);
    return this.db.source.create({
      data: { topicId: b.topicId, title: b.title, chunks: chunks(b.body) },
    });
  }
  @Post("sources/pdf")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 8 * 1024 * 1024, files: 1 },
    }),
  )
  async pdf(@Req() req: any, @Body() b: any, @UploadedFile() file: any) {
    await this.db.ownedTopic(req.user, parse(id, b.topicId));
    if (!file || file.buffer.subarray(0, 5).toString() !== "%PDF-")
      throw new BadRequestException("เลือกไฟล์ PDF ไม่เกิน 8 MB");
    let text = "";
    try {
      text = (
        await require("pdf-parse/lib/pdf-parse.js")(file.buffer)
      ).text.trim();
    } catch {
      throw new BadRequestException("อ่าน PDF ไม่สำเร็จ");
    }
    if (!text)
      throw new BadRequestException(
        "ไม่พบข้อความใน PDF กรุณาแปลงภาพเป็นข้อความก่อน",
      );
    return this.source(req, { topicId: b.topicId, title: b.title, body: text });
  }
  @Get("questions/:questionId/preview") async preview(
    @Req() req: any,
    @Param("questionId") questionId: string,
  ) {
    const question = await this.db.question.findFirst({
      where: {
        id: parse(id, questionId),
        topic: { goal: { userId: req.user } },
      },
      select: {
        key: true,
        hint: true,
        quote: true,
        source: { select: { title: true } },
      },
    });
    if (!question) throw new NotFoundException("ไม่พบคำถาม");
    return {
      key: question.key,
      hint: question.hint,
      quote: question.quote,
      source: question.source?.title || null,
    };
  }
  @Post("questions") async question(@Req() req: any, @Body() body: unknown) {
    const b = parse(
      z.object({
        topicId: id,
        prompt: short,
        key: short,
        hint: z.string().max(1000).default(""),
        kind: z.enum(["recall", "application", "explanation"]),
      }),
      body,
    );
    await this.db.ownedTopic(req.user, b.topicId);
    return this.db.question.create({ data: b, select: publicQuestion });
  }
  @Post("links") async link(@Req() req: any, @Body() body: unknown) {
    const b = parse(
        z.object({
          src: id,
          dst: id,
          kind: z.enum(["prerequisite", "related", "part_of"]),
        }),
        body,
      ),
      src = await this.db.ownedTopic(req.user, b.src),
      dst = await this.db.ownedTopic(req.user, b.dst);
    if (src.goalId !== dst.goalId || b.src === b.dst)
      throw new BadRequestException(
        "เลือกสองหัวข้อที่ต่างกันในเป้าหมายเดียวกัน",
      );
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${src.goalId}))`;
      const edges = await tx.link.findMany({
        where: { kind: b.kind, source: { goalId: src.goalId } },
      });
      if (b.kind !== "related" && hasCycle(edges, b.src, b.dst))
        throw new BadRequestException("ความสัมพันธ์จะเกิดวงจร");
      return tx.link.upsert({
        where: { src_dst_kind: b },
        create: b,
        update: {},
      });
    });
  }
  private async ownedQuestion(userId: string, q: string) {
    const row = await this.db.question.findFirst({
      where: { id: q, topic: { goal: { userId } } },
    });
    if (!row) throw new NotFoundException();
    return row;
  }
  @Post("hint") async hint(@Req() req: any, @Body() body: unknown) {
    const q = await this.ownedQuestion(
      req.user,
      parse(z.object({ q: id }), body).q,
    );
    return { hint: q.hint };
  }
  @Post("attempts") async answer(@Req() req: any, @Body() body: unknown) {
    const b = parse(
      z.object({
        questionId: id,
        answer: short,
        confidence: z.number().int().min(1).max(5),
        hint: z.boolean(),
        seconds: z.number().int().nonnegative().max(31536000),
        request: id,
      }),
      body,
    );
    await this.ownedQuestion(req.user, b.questionId);
    const a = await this.db.attempt.upsert({
      where: { request: b.request },
      create: b,
      update: {},
      select: { id: true, questionId: true },
    });
    if (a.questionId !== b.questionId) throw new ConflictException();
    return { id: a.id };
  }
  @Post("reveal") async reveal(@Req() req: any, @Body() body: unknown) {
    const b = parse(z.object({ id }), body),
      a = await this.db.attempt.findFirst({
        where: {
          id: b.id,
          question: { topic: { goal: { userId: req.user } } },
        },
        include: {
          question: { include: { source: { select: { title: true } } } },
        },
      });
    if (!a) throw new NotFoundException();
    return {
      answer: a.answer,
      key: a.question.key,
      quote: a.question.quote,
      source: a.question.source?.title,
      feedback: a.feedback,
      rating: a.rating,
    };
  }
  @Post("rating") async rating(@Req() req: any, @Body() body: unknown) {
    const b = parse(
      z.object({ id, rating: z.number().int().min(1).max(4) }),
      body,
    );
    return this.db.$transaction(async (tx) => {
      const where = {
        id: b.id,
        question: { topic: { goal: { userId: req.user } } },
      };
      const first = await tx.attempt.findFirst({ where });
      if (!first) throw new NotFoundException();
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${first.questionId}))`;
      const a = await tx.attempt.findUniqueOrThrow({
        where: { id: b.id },
        include: { question: true },
      });
      if (a.nextDue) return { dueAt: a.nextDue };
      const score = (a.feedback as { score?: number } | null)?.score;
      const result = nextReview(
        b.rating,
        a.question.days,
        a.confidence,
        score ?? null,
      );
      await tx.question.update({ where: { id: a.questionId }, data: result });
      await tx.attempt.update({
        where: { id: a.id },
        data: { rating: b.rating, nextDue: result.dueAt },
      });
      return result;
    });
  }
  @Post("sessions/start") async start(@Req() req: any, @Body() body: unknown) {
    const b = parse(
      z.object({
        topicId: id,
        minutes: duration,
        instructions: z.array(z.string().min(1).max(1200)).length(5).optional(),
      }),
      body,
    );
    const t = await this.db.ownedTopic(req.user, b.topicId);
    const goals = await this.db.question.findMany({
      where: { topic: { goalId: t.goalId } },
      orderBy: { dueAt: "asc" },
      select: publicQuestion,
    });
    const recall = goals.find((q) => q.topicId === t.id),
      mixed =
        goals.find((q) => q.topicId !== t.id && q.kind === "application") ||
        goals.find((q) => q.topicId !== t.id) ||
        goals.find((q) => q.kind === "application");
    const times = minutes(b.minutes),
      instructions = b.instructions || [
        "เขียนสิ่งที่จำได้ก่อนเปิดบทเรียน",
        "อ่านเนื้อหาแล้วเชื่อมกับความรู้เดิม",
        "ตอบคำถามโดยปิดแหล่งเรียน",
        "ลองใช้แนวคิดนี้กับสถานการณ์ใหม่",
        "อธิบายให้ผู้เริ่มต้นเข้าใจในสามประโยค",
      ];
    const plan = phases.map((name, i) => ({
      name,
      minutes: times[i],
      instruction: instructions[i],
      questionId:
        i === 2 ? recall?.id || null : i === 3 ? mixed?.id || null : null,
    }));
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${req.user}::text))`;
      if (
        await tx.studySession.findFirst({
          where: { finished: false, topic: { goal: { userId: req.user } } },
        })
      )
        throw new ConflictException(
          "มีรอบเรียนค้างอยู่ กรุณาเรียนต่อจากภาพรวม",
        );
      return tx.studySession.create({ data: { topicId: t.id, plan } });
    });
  }
  @Post("sessions/next") async advance(@Req() req: any, @Body() body: unknown) {
    const b = parse(
      z.object({ id, step: z.number().int().min(0).max(4) }),
      body,
    );
    const r = await this.db.studySession.updateMany({
      where: {
        id: b.id,
        step: b.step,
        finished: false,
        topic: { goal: { userId: req.user } },
      },
      data: {
        step: { increment: 1 },
        stepStart: new Date(),
        finished: b.step === 4,
      },
    });
    if (!r.count) throw new ConflictException("ขั้นตอนนี้เปลี่ยนแล้ว");
    return { ok: true };
  }
}
@Module({ controllers: [LearningController] })
export class LearningModule {}
