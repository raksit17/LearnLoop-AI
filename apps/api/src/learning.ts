import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
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
import { chunks, hasCycle, nextReview } from "./engine";
import { buildStudyPlan } from "./study-plan";
import { DEFAULT_GOAL_CATEGORIES, normalizeCategoryName, categoryKey, isDefaultCategory } from "./goal-categories";
const id = z.string().uuid(),
  title = z.string().trim().min(1).max(500),
  short = z.string().trim().min(1).max(12000),
  categoryName = z.string().trim().min(1).max(80).transform(normalizeCategoryName);
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
    const [user, goals, categories, topics, sources, questions, attempts, links, sessions] =
      await Promise.all([
        this.db.user.findUnique({
          where: { id: userId },
          select: { id: true, name: true },
        }),
        this.db.goal.findMany({ where: { userId }, orderBy: { title: "asc" } }),
        this.db.goalCategory.findMany({ where: { userId }, orderBy: { name: "asc" }, select: { id: true, name: true, createdAt: true } }),
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
      categories: [
        ...DEFAULT_GOAL_CATEGORIES.map((name) => ({ id: null, name, builtIn: true })),
        ...categories.map((category) => ({ ...category, builtIn: false })),
      ],
      topics,
      sources,
      questions,
      attempts,
      links,
      sessions,
    };
  }
  /**
   * Category operations and goal writes share a per-user lock. Renaming a
   * category updates its existing goals atomically, without changing goal IDs.
   */
  private async lockGoalCategories(tx: any, userId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"goal-category:" + userId}))`;
  }

  private async resolveGoalCategory(tx: any, userId: string, requested: string, previous?: string) {
    const key = categoryKey(requested);
    const builtIn = DEFAULT_GOAL_CATEGORIES.find((name) => categoryKey(name) === key);
    if (builtIn) return builtIn;
    const custom = await tx.goalCategory.findFirst({ where: { userId, key }, select: { name: true } });
    if (custom) return custom.name;
    // Do not invalidate a pre-existing category value during a title-only edit.
    if (previous && categoryKey(previous) === key) return previous;
    throw new BadRequestException("ประเภทนี้ยังไม่มีในระบบ กรุณาเพิ่มประเภทก่อน");
  }

  @Post("goal-categories") async createCategory(@Req() req: any, @Body() body: unknown) {
    const b = parse(z.object({ name: categoryName }).strict(), body);
    const key = categoryKey(b.name);
    if (isDefaultCategory(b.name)) throw new ConflictException("มีประเภทนี้อยู่แล้ว");
    return this.db.$transaction(async (tx) => {
      await this.lockGoalCategories(tx, req.user);
      if (await tx.goalCategory.findFirst({ where: { userId: req.user, key } }))
        throw new ConflictException("มีประเภทนี้อยู่แล้ว");
      return tx.goalCategory.create({
        data: { userId: req.user, name: b.name, key },
        select: { id: true, name: true, createdAt: true },
      });
    });
  }

  @Patch("goal-categories/:categoryId") async renameCategory(
    @Req() req: any, @Param("categoryId") categoryId: string, @Body() body: unknown,
  ) {
    const cid = parse(id, categoryId);
    const b = parse(z.object({ name: categoryName }).strict(), body);
    const key = categoryKey(b.name);
    if (isDefaultCategory(b.name)) throw new ConflictException("มีประเภทนี้อยู่แล้ว");
    return this.db.$transaction(async (tx) => {
      await this.lockGoalCategories(tx, req.user);
      const current = await tx.goalCategory.findFirst({ where: { id: cid, userId: req.user } });
      if (!current) throw new NotFoundException("ไม่พบประเภท");
      const duplicate = await tx.goalCategory.findFirst({ where: { userId: req.user, key } });
      if (duplicate && duplicate.id !== cid) throw new ConflictException("มีประเภทนี้อยู่แล้ว");
      await tx.goal.updateMany({
        where: { userId: req.user, domain: current.name },
        data: { domain: b.name },
      });
      return tx.goalCategory.update({
        where: { id: current.id },
        data: { name: b.name, key },
        select: { id: true, name: true, createdAt: true },
      });
    });
  }

  @Delete("goal-categories/:categoryId") async deleteCategory(
    @Req() req: any, @Param("categoryId") categoryId: string, @Body() body: unknown,
  ) {
    const cid = parse(id, categoryId);
    const b = parse(z.object({ confirmName: categoryName }).strict(), body);
    return this.db.$transaction(async (tx) => {
      await this.lockGoalCategories(tx, req.user);
      const category = await tx.goalCategory.findFirst({ where: { id: cid, userId: req.user } });
      if (!category) throw new NotFoundException("ไม่พบประเภท");
      if (category.name !== b.confirmName)
        throw new ConflictException("ชื่อประเภทที่ยืนยันไม่ตรงกัน");
      if (await tx.goal.count({ where: { userId: req.user, domain: category.name } }))
        throw new ConflictException("ยังมีเป้าหมายใช้ประเภทนี้ กรุณาย้ายเป้าหมายไปประเภทอื่นก่อน");
      await tx.goalCategory.delete({ where: { id: category.id } });
      return { ok: true, deleted: "category", id: category.id };
    });
  }

  @Post("goals") async goal(@Req() req: any, @Body() body: unknown) {
    const b = parse(z.object({ title, domain: categoryName }).strict(), body);
    return this.db.$transaction(async (tx) => {
      await this.lockGoalCategories(tx, req.user);
      const domain = await this.resolveGoalCategory(tx, req.user, b.domain);
      return tx.goal.create({ data: { title: b.title, domain, userId: req.user } });
    });
  }

  // All edits are restricted to the signed-in user's own data.
  @Patch("goals/:goalId") async updateGoal(
    @Req() req: any, @Param("goalId") goalId: string, @Body() body: unknown,
  ) {
    const idToEdit = parse(id, goalId);
    const b = parse(z.object({ title, domain: categoryName }).strict(), body);
    return this.db.$transaction(async (tx) => {
      await this.lockGoalCategories(tx, req.user);
      const goal = await tx.goal.findFirst({ where: { id: idToEdit, userId: req.user } });
      if (!goal) throw new NotFoundException("ไม่พบเป้าหมาย");
      const domain = await this.resolveGoalCategory(tx, req.user, b.domain, goal.domain);
      return tx.goal.update({ where: { id: goal.id }, data: { title: b.title, domain } });
    });
  }

  @Patch("topics/:topicId") async updateTopic(
    @Req() req: any,
    @Param("topicId") topicId: string,
    @Body() body: unknown,
  ) {
    const idToEdit = parse(id, topicId);
    const b = parse(z.object({ title }).strict(), body);
    const updated = await this.db.topic.updateMany({
      where: { id: idToEdit, goal: { userId: req.user } },
      data: b,
    });
    if (!updated.count) throw new NotFoundException("ไม่พบหัวข้อ");
    return this.db.topic.findFirstOrThrow({
      where: { id: idToEdit, goal: { userId: req.user } },
    });
  }

  @Delete("goals/:goalId") async deleteGoal(
    @Req() req: any,
    @Param("goalId") goalId: string,
    @Body() body: unknown,
  ) {
    const idToDelete = parse(id, goalId);
    const b = parse(
      z.object({ confirmTitle: title }).strict(),
      body,
    );
    return this.db.$transaction(async (tx) => {
      const goal = await tx.goal.findFirst({
        where: { id: idToDelete, userId: req.user },
        select: { id: true, title: true, topics: { select: { id: true } } },
      });
      if (!goal) throw new NotFoundException("ไม่พบเป้าหมาย");
      if (goal.title !== b.confirmTitle)
        throw new ConflictException("ชื่อเป้าหมายที่ยืนยันไม่ตรงกัน");
      const ids = goal.topics.map(t => t.id);
      await this.deleteTopicChildren(tx, ids);
      await tx.topic.deleteMany({ where: { id: { in: ids }, goalId: goal.id } });
      await tx.goal.delete({ where: { id: goal.id } });
      return { ok: true, deleted: "goal", id: goal.id };
    });
  }

  @Delete("topics/:topicId") async deleteTopic(
    @Req() req: any,
    @Param("topicId") topicId: string,
    @Body() body: unknown,
  ) {
    const idToDelete = parse(id, topicId);
    const b = parse(
      z.object({ confirmTitle: title }).strict(),
      body,
    );
    return this.db.$transaction(async (tx) => {
      const topic = await tx.topic.findFirst({
        where: { id: idToDelete, goal: { userId: req.user } },
        select: { id: true, title: true },
      });
      if (!topic) throw new NotFoundException("ไม่พบหัวข้อ");
      if (topic.title !== b.confirmTitle)
        throw new ConflictException("ชื่อหัวข้อที่ยืนยันไม่ตรงกัน");
      await this.deleteTopicChildren(tx, [topic.id]);
      await tx.topic.delete({ where: { id: topic.id } });
      return { ok: true, deleted: "topic", id: topic.id };
    });
  }

  /**
   * Attempts and study sessions have RESTRICT foreign keys; clean these
   * before removing questions and topics. The transaction rolls back
   * everything if any dependent record cannot be removed.
   */
  private async deleteTopicChildren(tx: any, topicIds: string[]) {
    if (!topicIds.length) return;
    await tx.attempt.deleteMany({ where: { question: { topicId: { in: topicIds } } } });
    await tx.studySession.deleteMany({ where: { topicId: { in: topicIds } } });
    await tx.question.deleteMany({ where: { topicId: { in: topicIds } } });
    await tx.source.deleteMany({ where: { topicId: { in: topicIds } } });
    await tx.link.deleteMany({
      where: { OR: [{ src: { in: topicIds } }, { dst: { in: topicIds } }] },
    });
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
  @Get("sources/:sourceId/artifacts") async sourceArtifact(
    @Req() req: any,
    @Param("sourceId") sourceId: string,
    @Query("section") sectionQuery: string | undefined,
    @Query("kind") kindQuery: string | undefined,
    @Query("scope") scopeQuery: string | undefined,
  ) {
    const kind = parse(z.enum(["reading_aid", "mindmap"]), kindQuery);
    const scope = parse(z.enum(["section", "all"]).default("section"), scopeQuery);
    const source = await this.db.source.findFirst({
      where: { id: parse(id, sourceId), topic: { goal: { userId: req.user } } },
      select: { id: true, chunks: true },
    });
    if (!source) throw new NotFoundException("ไม่พบแหล่งเรียน");

    // One authorized request retrieves all existing per-section summaries.
    // Keep the original section API unchanged for ReadingAid and MindMap.
    if (scope === "all") {
      if (kind !== "reading_aid")
        throw new BadRequestException("สรุปทั้งบทเรียนรองรับชนิด reading_aid เท่านั้น");
      const cached = await this.db.sourceArtifact.findMany({
        where: { sourceId: source.id, kind, section: { gte: 0, lt: source.chunks.length } },
        orderBy: { section: "asc" },
        select: { section: true, payload: true, createdAt: true },
      });
      return { kind, scope, total: source.chunks.length, items: cached };
    }

    const section = parse(z.coerce.number().int().nonnegative(), sectionQuery ?? "0");
    if (section >= source.chunks.length)
      throw new BadRequestException("ไม่มีเนื้อหาส่วนนี้");
    const artifact = await this.db.sourceArtifact.findUnique({
      where: { sourceId_section_kind: { sourceId: source.id, section, kind } },
      select: { payload: true, createdAt: true },
    });
    return { kind, section, payload: artifact?.payload ?? null, createdAt: artifact?.createdAt ?? null };
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
  private async makeStudyPlan(
    userId: string,
    topicId: string,
    minutes: number,
    aiTips: string[] = [],
  ) {
    const topic = await this.db.ownedTopic(userId, topicId);
    const questions = await this.db.question.findMany({
      where: { topic: { goalId: topic.goalId } },
      orderBy: { dueAt: "asc" },
      select: publicQuestion,
    });
    return buildStudyPlan(topic.id, topic.title, minutes, questions, aiTips);
  }

  @Post("sessions/preview") async previewSession(
    @Req() req: any,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ topicId: id, minutes: duration }), body);
    return { plan: await this.makeStudyPlan(req.user, b.topicId, b.minutes) };
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
    const plan = await this.makeStudyPlan(
      req.user, b.topicId, b.minutes, b.instructions,
    );
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
      return tx.studySession.create({
        data: { topicId: b.topicId, plan, evidence: [] },
      });
    });
  }

  @Post("sessions/reflection") async reflection(
    @Req() req: any,
    @Body() body: unknown,
  ) {
    const b = parse(
      z.object({
        id,
        step: z.number().int().min(0).max(4),
        text: z.string().max(4000),
      }),
      body,
    );
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${b.id}::text))`;
      const session = await tx.studySession.findFirst({
        where: { id: b.id, topic: { goal: { userId: req.user } } },
        select: { step: true, evidence: true },
      });
      if (!session) throw new NotFoundException("ไม่พบรอบเรียน");
      if (b.step > session.step) {
        throw new ConflictException("ยังไม่ถึงกิจกรรมที่เลือก");
      }
      const evidence = Array.isArray(session.evidence)
        ? [...session.evidence] : [];
      evidence[b.step] = b.text;
      await tx.studySession.update({
        where: { id: b.id },
        data: { evidence },
      });
      return { ok: true };
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
