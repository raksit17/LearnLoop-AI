import {
  Injectable,
  Module,
  Global,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
  CanActivate,
  ExecutionContext,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { localDemoEnabled } from "./local";
import { ZodType, ZodTypeDef } from "zod";

export function parse<T>(
  schema: ZodType<T, ZodTypeDef, any>,
  body: unknown,
): T {
  const result = schema.safeParse(body);
  if (!result.success)
    throw new BadRequestException(
      "ตรวจสอบข้อมูล " +
        result.error.issues.map((i) => i.path.join(".")).join(", "),
    );
  return result.data;
}
export function cookie(req: any, key: string) {
  return (
    String(req.headers.cookie || "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(key + "="))
      ?.slice(key.length + 1) || ""
  );
}
export const digest = (s: string) =>
  createHash("sha256").update(s).digest("hex");
@Injectable()
export class Database extends PrismaClient {
  async ownedTopic(userId: string, id: string) {
    const topic = await this.topic.findFirst({
      where: { id, goal: { userId } },
      include: { goal: true },
    });
    if (!topic) throw new NotFoundException();
    return topic;
  }
}
@Injectable()
export class MemberGuard implements CanActivate {
  constructor(private db: Database) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    if (localDemoEnabled()) {
      const demo = await this.db.user.upsert({
        where: { identity: "demo:local" },
        create: { identity: "demo:local", name: "ผู้เรียนทดลอง" },
        update: {},
        select: { id: true },
      });
      req.user = demo.id;
      return true;
    }
    const token = await this.db.token.findUnique({
      where: { digest: digest(cookie(req, "sid")) },
    });
    if (!token || token.expires <= new Date())
      throw new UnauthorizedException("กรุณาเข้าสู่ระบบ");
    req.user = token.userId;
    return true;
  }
}
@Global()
@Module({
  providers: [Database, MemberGuard],
  exports: [Database, MemberGuard],
})
export class CoreModule {}
