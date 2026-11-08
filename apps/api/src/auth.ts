import { ollamaReady } from "./ai/provider";
import {
  Controller,
  Module,
  Get,
  Post,
  Req,
  Res,
  Body,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { Issuer, generators } from "openid-client";
import { Database, cookie, digest, parse } from "./core";
import { z } from "zod";
const derive = promisify(scrypt);
const login = z.object({
  email: z.string().trim().email().max(254).toLowerCase(),
  password: z.string().min(8).max(200),
});
const base = process.env.PUBLIC_URL || "http://localhost:4318";
const options = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: base.startsWith("https:"),
  path: "/",
};
@Controller()
export class AuthController {
  constructor(private db: Database) {}
  private async session(id: string, res: any) {
    const token = randomBytes(32).toString("hex"),
      ttl = 30 * 86400000;
    await this.db.token.create({
      data: {
        userId: id,
        digest: digest(token),
        expires: new Date(Date.now() + ttl),
      },
    });
    res.cookie("sid", token, { ...options, maxAge: ttl });
    return { ok: true };
  }
  @Post("register") async register(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: any,
  ) {
    const b = parse(
        login.extend({ name: z.string().trim().min(1).max(100) }),
        body,
      ),
      salt = randomBytes(16).toString("hex");
    const hash = ((await derive(b.password, salt, 32)) as Buffer).toString(
      "hex",
    );
    try {
      const u = await this.db.user.create({
        data: {
          name: b.name,
          identity: "email:" + b.email,
          password: salt + ":" + hash,
        },
      });
      return this.session(u.id, res);
    } catch (e: any) {
      if (e.code === "P2002")
        throw new ConflictException("อีเมลนี้มีบัญชีแล้ว");
      throw e;
    }
  }
  @Post("login") async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: any,
  ) {
    const b = parse(login, body),
      u = await this.db.user.findUnique({
        where: { identity: "email:" + b.email },
      });
    const [salt, hash] = (u?.password || "unused:" + "0".repeat(64)).split(":");
    if (
      !timingSafeEqual(
        (await derive(b.password, salt, 32)) as Buffer,
        Buffer.from(hash, "hex"),
      ) ||
      !u
    )
      throw new UnauthorizedException("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
    return this.session(u.id, res);
  }
  @Post("logout") async logout(
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    await this.db.token.deleteMany({
      where: { digest: digest(cookie(req, "sid")) },
    });
    res.clearCookie("sid", options);
    return { ok: true };
  }
  @Get("health") async health() {
    await this.db.$queryRaw`SELECT 1`;
    return {
      ok: true,
      oidc: !!process.env.OIDC_ISSUER,
      ai: await ollamaReady(),
    };
  }
  private async oidc() {
    if (!process.env.OIDC_ISSUER || !process.env.OIDC_CLIENT_ID)
      throw new ServiceUnavailableException("ยังไม่ได้ตั้งค่า OIDC");
    const issuer = await Issuer.discover(process.env.OIDC_ISSUER);
    return new issuer.Client({
      client_id: process.env.OIDC_CLIENT_ID,
      client_secret: process.env.OIDC_CLIENT_SECRET,
      redirect_uris: [base + "/v1/oidc/callback"],
      response_types: ["code"],
    });
  }
  @Get("oidc") async begin(@Res() res: any) {
    const client = await this.oidc(),
      state = generators.state(),
      verifier = generators.codeVerifier();
    res.cookie("login_state", state, { ...options, maxAge: 300000 });
    res.cookie("verifier", verifier, { ...options, maxAge: 300000 });
    res.redirect(
      client.authorizationUrl({
        scope: "openid profile",
        state,
        code_challenge: generators.codeChallenge(verifier),
        code_challenge_method: "S256",
      }),
    );
  }
  @Get("oidc/callback") async callback(@Req() req: any, @Res() res: any) {
    const client = await this.oidc(),
      state = cookie(req, "login_state"),
      verifier = cookie(req, "verifier");
    if (!state || !verifier) throw new BadRequestException();
    const tokens = await client.callback(
        base + "/v1/oidc/callback",
        client.callbackParams(req),
        { state, code_verifier: verifier },
      ),
      claims = tokens.claims();
    const identity = JSON.stringify([claims.iss, claims.sub]);
    const user = await this.db.user.upsert({
      where: { identity },
      create: { identity, name: String(claims.name || "ผู้เรียน") },
      update: {},
    });
    res.clearCookie("login_state", options);
    res.clearCookie("verifier", options);
    await this.session(user.id, res);
    res.redirect("/");
  }
}
@Module({ controllers: [AuthController] })
export class AuthModule {}
