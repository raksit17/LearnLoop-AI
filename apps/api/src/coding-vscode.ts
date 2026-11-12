import { Body, Controller, Get, Headers, Module, Param, Post, Req, UnauthorizedException, NotFoundException, BadRequestException, UseGuards } from "@nestjs/common";
import { randomBytes, createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { Database, digest, MemberGuard, parse } from "./core";
import { findExercise, library } from "./coding-exercises";

const pairCode = z.string().regex(/^[a-f0-9]{32}$/);
const exerciseId = z.string().min(1).max(90);
const reportSchema = z.object({
  index: z.number().int().min(0).max(2),
  actual: z.unknown().optional(),
  error: z.string().max(2000).optional(),
}).strict();
const submissionSchema = z.object({
  exerciseId,
  runId: z.string().uuid(),
  answer: z.string().min(1).max(64000),
  cases: z.array(reportSchema).length(3),
}).strict();

@Controller("coding")
export class CodingVscodeController {
  constructor(private db: Database) {}

  private async device(authorization?: string) {
    const token = /^Bearer ([a-f0-9]{64})$/.exec(authorization ?? "")?.[1];
    if (!token) throw new UnauthorizedException("เชื่อมต่อ VS Code ก่อน");
    const device = await this.db.codingDevice.findUnique({ where: { digest: digest(token) } });
    if (!device || device.expiresAt <= new Date()) throw new UnauthorizedException("การเชื่อมต่อ VS Code หมดอายุ กรุณาจับคู่ใหม่");
    return device;
  }

  @Post("pair/start")
  @UseGuards(MemberGuard)
  async start(@Req() req: any) {
    const code = randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const pairing = await this.db.codingPairing.create({
      data: { userId: req.user, digest: digest(code), expiresAt },
      select: { id: true },
    });
    return { pairingId: pairing.id, code, expiresAt };
  }

  @Get("pair/status/:id")
  @UseGuards(MemberGuard)
  async status(@Req() req: any, @Param("id") id: string) {
    const pairing = await this.db.codingPairing.findFirst({
      where: { id: parse(z.string().uuid(), id), userId: req.user },
      select: { usedAt: true, expiresAt: true },
    });
    if (!pairing) throw new NotFoundException();
    return { connected: !!pairing.usedAt, expired: pairing.expiresAt <= new Date() };
  }

  @Post("pair/exchange")
  async exchange(@Body() body: unknown) {
    const { code, name } = parse(z.object({
      code: pairCode,
      name: z.string().trim().min(1).max(80).default("VS Code"),
    }).strict(), body);
    const key = digest(code);
    const expiresAt = new Date(Date.now() + 30 * 86400000);
    const token = randomBytes(32).toString("hex");
    const device = await this.db.$transaction(async tx => {
      const pairing = await tx.codingPairing.findUnique({ where: { digest: key } });
      if (!pairing || pairing.expiresAt <= new Date() || pairing.usedAt) throw new UnauthorizedException("รหัสจับคู่ไม่ถูกต้องหรือหมดอายุ");
      const claimed = await tx.codingPairing.updateMany({
        where: { id: pairing.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) throw new UnauthorizedException("รหัสนี้ถูกใช้งานแล้ว");
      return tx.codingDevice.create({
        data: { userId: pairing.userId, digest: digest(token), name, expiresAt },
        select: { id: true },
      });
    });
    return { token, deviceId: device.id, expiresAt };
  }

  @Get("extension/health")
  async health(@Headers("authorization") auth?: string) {
    const device = await this.device(auth);
    return { connected: true, name: device.name };
  }

  @Get("extension/catalog")
  async catalog(@Headers("authorization") auth?: string) {
    await this.device(auth);
    return { exercises: library.map(({ id, title, prompt, skill, level }) => ({ id, title, prompt, skill, level })) };
  }

  @Get("extension/exercises/:id")
  async exercise(@Headers("authorization") auth: string | undefined, @Param("id") id: string) {
    await this.device(auth);
    const ex = findExercise(parse(exerciseId, id));
    if (!ex) throw new NotFoundException("ไม่พบโจทย์");
    return ex;
  }

  @Post("extension/submit")
  async submit(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const device = await this.device(auth);
    const data = parse(submissionSchema, body);
    const exercise = findExercise(data.exerciseId);
    if (!exercise) throw new NotFoundException("ไม่พบโจทย์");
    if (new Set(data.cases.map(c => c.index)).size !== exercise.cases.length)
      throw new BadRequestException("ต้องส่งผลครบทุกกรณีโดยไม่ซ้ำกัน");
    const reports = [...data.cases].sort((a, b) => a.index - b.index).map((c, index) => {
      if (c.index !== index) throw new BadRequestException("หมายเลขกรณีไม่ถูกต้อง");
      const expected = exercise.cases[index][1];
      const passed = !c.error && isDeepStrictEqual(c.actual, expected);
      return { index, passed, expected, actual: c.actual === undefined ? null : c.actual, error: c.error ?? null };
    });
    const passed = reports.filter(c => c.passed).length;
    const failedCases = reports.filter(c => !c.passed).map(c => c.index);
    // One stable CodingFile per device and exercise keeps runId retry idempotent.
    const key = createHash("sha256").update("learnloop-vscode:" + device.id + ":" + exercise.id).digest("hex");
    const file = await this.db.codingFile.upsert({
      where: { digest: key },
      create: { userId: device.userId, digest: key, exercise: exercise.id },
      update: {},
      select: { id: true },
    });
    const saved = await this.db.codingResult.upsert({
      where: { fileId_runId: { fileId: file.id, runId: data.runId } },
      create: { fileId: file.id, runId: data.runId, answer: data.answer, passed, total: reports.length, failedCases, reports: reports as Prisma.InputJsonValue },
      update: {},
      select: { id: true, passed: true, total: true, failedCases: true },
    });
    return saved;
  }
}
@Module({ controllers: [CodingVscodeController] })
export class CodingVscodeModule {}
