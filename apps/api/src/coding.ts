import { Prisma } from "@prisma/client";
import { BadRequestException, NotFoundException, Body, Controller, Get, Headers, Module, Param, Post, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { Database, digest, MemberGuard, parse } from "./core";

import { findExercise, library, skills, drill } from "./coding-exercises";
import { coach, kinds } from "./coding-coach";
const exerciseId = z.string().max(90).refine(value => !!findExercise(value));
const result = z.object({
  runId: z.string().uuid(),
  answer: z.string().min(1).max(64000),
  passed: z.number().int().min(0).max(3),
  total: z.literal(3),
  failedCases: z.array(z.number().int().min(0).max(2)).max(3).optional(),
});

@Controller("coding")
export class CodingController {
  constructor(private db: Database) {}

  @Post("files")
  @UseGuards(MemberGuard)
  async issue(@Req() req: any, @Body() body: unknown) {
    const { exercise } = parse(z.object({ exercise: exerciseId }), body);
    const token = randomBytes(32).toString("hex");
    const file = await this.db.codingFile.create({
      data: { userId: req.user, exercise, digest: digest(token) },
      select: { id: true },
    });
    return { attempt: file.id, token };
  }

  @Post("submit")
  async submit(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const token = /^Bearer ([a-f0-9]{64})$/.exec(auth ?? "")?.[1];
    if (!token) throw new UnauthorizedException();
    const file = await this.db.codingFile.findUnique({ where: { digest: digest(token) }, select: { id: true } });
    if (!file) throw new UnauthorizedException();
    const data = parse(result, body);
    if (data.failedCases && (new Set(data.failedCases).size !== data.total - data.passed || new Set(data.failedCases).size !== data.failedCases.length)) throw new BadRequestException('ผลรายกรณีไม่ตรงกับคะแนน');
    const where = { fileId_runId: { fileId: file.id, runId: data.runId } };
    try {
      return await this.db.codingResult.create({
        data: { fileId: file.id, ...data },
        select: { id: true },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      return this.db.codingResult.findUniqueOrThrow({ where, select: { id: true } });
    }
  }

  @Post("coach/:id")
  @UseGuards(MemberGuard)
  async help(@Req() req: any, @Param("id") id: string, @Body() body: unknown) {
    const { kind } = parse(z.object({ kind: kinds }), body);
    const row = await this.db.codingResult.findFirst({ where: { id, file: { userId: req.user } }, include: { file:true, tutorNotes:true } });
    if (!row) throw new NotFoundException();
    const cached = row.tutorNotes.find(note => note.kind === kind);
    if (cached) return cached.content;
    const content = await coach(kind, findExercise(row.file.exercise)!, row);
    const note = await this.db.codingTutorNote.upsert({
      where: { resultId_kind: {resultId:id, kind} }, create: { resultId:id, kind, content }, update: { }, select:{content:true}
    }).catch(async error => {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      return this.db.codingTutorNote.findUniqueOrThrow({ where:{resultId_kind:{resultId:id,kind}}, select:{content:true} });
    });
    return note.content;
  }

  @Get("plan")
  @UseGuards(MemberGuard)
  async plan(@Req() req: any) {
    const rows = await this.db.codingResult.findMany({
      where:{file:{userId:req.user}}, orderBy:[{createdAt:"desc"},{id:"desc"}], take:300,
      select:{file:{select:{exercise:true}}, fileId:true, passed:true, total:true, failedCases:true, createdAt:true,
        tutorNotes:{where:{kind:{in:["hint1","hint2","hint3"]}}, select:{createdAt:true,kind:true}}}
    });
    const latest = new Map<string, typeof rows[number]>();
    const usedHints = new Map<string, number>();
    const misses = new Map<string, Set<string>>();
    const queue = new Map<string, ReturnType<typeof drill>>();
    for (const row of rows) {
      const id = row.file.exercise;
      const ex = findExercise(id);
      if (!ex) continue;
      if (!latest.has(id)) latest.set(id, row);
      for (const note of row.tutorNotes) {
        const key = id;
        usedHints.set(key, Math.min(usedHints.get(key) ?? Infinity, note.createdAt.getTime()));
      }
      if (row.passed === row.total || id.startsWith("review-")) continue;
      const set = misses.get(ex.skill) ?? new Set<string>();
      set.add(id);
      misses.set(ex.skill, set);
      for (const index of row.failedCases) {
        const practice = drill(ex, index);
        queue.set(practice.id, practice);
      }
    }
    const open = [...queue.values()].filter(item => {
      const last = latest.get(item.id);
      return !last || last.passed < last.total;
    });
    const stats = Object.entries(skills).map(([skill,label]) => {
      const practiced = library.filter(ex => ex.skill === skill && latest.has(ex.id));
      const independent = practiced.filter(ex => {
        const last = latest.get(ex.id)!;
        return last.passed === last.total && (usedHints.get(ex.id) ?? Infinity) > last.createdAt.getTime();
      }).length;
      return {skill,label,attempted:practiced.length, missed:misses.get(skill)?.size ?? 0, independent};
    });
    const independent = stats.reduce((n,s) => n+s.independent,0);
    const recent = rows.filter(row => !row.file.exercise.startsWith("review-")).slice(0,3);
    const struggling = recent.length >= 2 && recent[0].passed < recent[0].total && recent[1].passed < recent[1].total;
    const level = struggling ? 1 : independent >= 4 ? 3 : independent >= 2 ? 2 : 1;
    const weakSkill = struggling ? findExercise(recent[0].file.exercise)?.skill : undefined;
    const pool = library.filter(ex => ex.level === level);
    const recommendation = pool.find(ex => ex.skill === weakSkill && (!latest.has(ex.id) || latest.get(ex.id)!.passed < 3)) ??
      pool.find(ex => !latest.has(ex.id)) ?? pool[0];
    // Previously downloaded review files remain available after mastery.
    const drills = new Map(queue);
    for (const id of latest.keys()) if (id.startsWith("review-")) {
      const ex = findExercise(id);
      if (ex) drills.set(id, ex);
    }
    return { catalog:[...library,...drills.values()], stats, pending:open.map(ex=>ex.id), level,
      recommendation:recommendation.id, reason:struggling ? "สองรอบล่าสุดยังติดขัด ลองทบทวนพื้นฐาน" :
        "แก้โจทย์ผ่านด้วยตนเอง " + independent + " ข้อ", window:rows.length };
  }

  @Get("history/:exercise")
  @UseGuards(MemberGuard)
  history(@Req() req: any, @Param("exercise") exercise: string) {
    return this.db.codingResult.findMany({
      where: { file: { userId: req.user, exercise: parse(exerciseId, exercise) } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 10,
      select: { id: true, fileId: true, createdAt: true, answer: true, passed: true, total: true, failedCases: true, tutorNotes: { select: {kind:true, content:true} } },
    });
  }
}
@Module({ controllers: [CodingController] })
export class CodingModule {}
