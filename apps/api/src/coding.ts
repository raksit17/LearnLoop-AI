import { Prisma } from "@prisma/client";
import { Body, Controller, Get, Headers, Module, Param, Post, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { Database, digest, MemberGuard, parse } from "./core";

const exerciseId = z.enum(["uniqueIds", "countStatuses", "chunkJobs"]);
const result = z.object({
  runId: z.string().uuid(),
  answer: z.string().min(1).max(64000),
  passed: z.number().int().min(0).max(3),
  total: z.literal(3),
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

  @Get("history/:exercise")
  @UseGuards(MemberGuard)
  history(@Req() req: any, @Param("exercise") exercise: string) {
    return this.db.codingResult.findMany({
      where: { file: { userId: req.user, exercise: parse(exerciseId, exercise) } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 10,
      select: { id: true, fileId: true, createdAt: true, answer: true, passed: true, total: true },
    });
  }
}
@Module({ controllers: [CodingController] })
export class CodingModule {}
