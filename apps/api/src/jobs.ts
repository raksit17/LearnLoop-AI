import { ollamaReady } from "./ai/provider";
import {
  Body,
  Controller,
  Get,
  Module,
  NotFoundException,
  Param,
  Post,
  Req,
  ServiceUnavailableException,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import { Queue } from "bullmq";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { MemberGuard, Database, parse } from "./core";
import { queueName, connection, Payload } from "./ai/queue";
import { duration } from "./learning";
@Controller("ai")
@UseGuards(MemberGuard)
export class JobsController {
  private queue = new Queue<Payload>(queueName, {
    connection: {
      ...connection,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    },
  });
  constructor(private db: Database) {}
  @Post(":task") async submit(
    @Req() req: any,
    @Param("task") task: string,
    @Body() body: unknown,
  ) {
    if (!(await ollamaReady()))
      throw new ServiceUnavailableException(
        "เชื่อมต่อ Ollama หรือหาโมเดลที่เลือกไม่พบ ตรวจ OLLAMA_URL และ ollama list",
      );
    const b = parse(
      z.object({
        resourceId: z.string().uuid(),
        section: z.number().int().nonnegative().default(0),
        minutes: duration.default(30),
      }),
      body,
    );
    const userId = req.user;
    if (["generate", "reading-aid", "mindmap"].includes(task)) {
      const s = await this.db.source.findFirst({
        where: { id: b.resourceId, topic: { goal: { userId } } },
      });
      if (!s) throw new NotFoundException();
      if (b.section >= s.chunks.length)
        throw new BadRequestException("ไม่มีเนื้อหาส่วนนี้");
    } else if (task === "planner") {
      await this.db.ownedTopic(userId, b.resourceId);
    } else if (task === "tutor") {
      if (
        !(await this.db.attempt.findFirst({
          where: {
            id: b.resourceId,
            question: { topic: { goal: { userId } } },
          },
        }))
      )
        throw new NotFoundException();
    } else throw new NotFoundException();
    const stableJobId = task === "tutor"
      ? "tutor-" + b.resourceId
      : task === "reading-aid" || task === "mindmap"
        ? task + "-" + b.resourceId + "-" + b.section
        : null;
    const prior = stableJobId ? await this.queue.getJob(stableJobId) : null;
    if (prior && (await prior.getState()) === "failed") {
      await prior.retry();
      return { jobId: prior.id };
    }
    const job = await this.queue.add(
      task,
      { ...b, userId },
      {
        jobId: stableJobId || randomUUID(),
        removeOnComplete: { age: 86400 },
        removeOnFail: { age: 86400 },
      },
    );
    return { jobId: job.id };
  }
  @Get("jobs/:id") async status(@Req() req: any, @Param("id") id: string) {
    const j = await this.queue.getJob(id);
    if (!j || j.data.userId !== req.user)
      throw new NotFoundException("ไม่พบงาน AI กรุณาลองส่งอีกครั้ง");
    const state = await j.getState();
    return {
      state,
      result: state === "completed" ? j.returnvalue : null,
      error:
        state === "failed"
          ? "งาน AI ไม่สำเร็จ ตรวจการเชื่อมต่อ Ollama โมเดล และข้อความอ้างอิง แล้วลองอีกครั้ง"
          : null,
    };
  }
}
@Module({ controllers: [JobsController] })
export class AiModule {}
