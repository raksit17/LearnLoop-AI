import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Module } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { CoreModule } from "./core";
import { AuthModule } from "./auth";
import { LearningModule } from "./learning";
import { AiModule } from "./jobs";
@Module({ imports: [CoreModule, AuthModule, LearningModule, AiModule] })
class AppModule {}
async function main() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser("json", { limit: "900kb" });
  app.use((req: any, res: any, next: any) => {
    res.setHeader("Cache-Control", "no-store");
    if (
      req.method === "POST" &&
      req.headers.origin &&
      req.headers.origin !== (process.env.PUBLIC_URL || "http://localhost:4318")
    )
      return res.status(403).json({ message: "แหล่งคำขอไม่ตรงกับ PUBLIC_URL" });
    next();
  });
  app.setGlobalPrefix("v1");
  await app.listen(
    Number(process.env.PORT || 3001),
    process.env.HOST || "0.0.0.0",
  );
}
void main();
