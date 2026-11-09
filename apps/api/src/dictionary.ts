import {
  BadRequestException, ConflictException, Controller, Delete, Get,
  Module, NotFoundException, Param, Patch, Post, Body, Req, UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { Database, MemberGuard, parse } from "./core";
import { nextReview } from "./engine";
import { normalizeDictionaryKey } from "./dictionary-utils";

const uuid = z.string().uuid();
const groupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000).default(""),
}).strict();
const wordSchema = z.object({
  word: z.string().trim().min(1).max(120),
  meaning: z.string().trim().min(1).max(500),
  partOfSpeech: z.enum(["noun", "verb", "adjective", "adverb", "phrase", "other"]).default("other"),
  pronunciation: z.string().trim().max(120).default(""),
  example: z.string().trim().max(1200).default(""),
  exampleTranslation: z.string().trim().max(1200).default(""),
  nuance: z.string().trim().max(1200).default(""),
}).strict();

@Controller("dictionary")
@UseGuards(MemberGuard)
export class DictionaryController {
  constructor(private db: Database) {}

  private async unique<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (e: any) {
      if (e?.code === "P2002") throw new ConflictException("มีชื่อหรือคำศัพท์นี้อยู่ในกลุ่มแล้ว");
      throw e;
    }
  }
  private async ownedGroup(userId: string, groupId: string) {
    const group = await this.db.vocabularyGroup.findFirst({ where: { id: groupId, userId } });
    if (!group) throw new NotFoundException("ไม่พบกลุ่มคำศัพท์");
    return group;
  }

  @Get()
  list(@Req() req: any) {
    return this.db.vocabularyGroup.findMany({
      where: { userId: req.user },
      orderBy: { createdAt: "desc" },
      include: {
        words: { orderBy: [{ dueAt: "asc" }, { word: "asc" }] },
      },
    });
  }

  @Post("groups")
  createGroup(@Req() req: any, @Body() body: unknown) {
    const input = parse(groupSchema, body);
    return this.unique(() => this.db.vocabularyGroup.create({
      data: { userId: req.user, ...input, nameKey: normalizeDictionaryKey(input.name) },
    }));
  }

  @Patch("groups/:groupId")
  async updateGroup(@Req() req: any, @Param("groupId") param: string, @Body() body: unknown) {
    const groupId = parse(uuid, param), input = parse(groupSchema, body);
    await this.ownedGroup(req.user, groupId);
    return this.unique(async () => {
      const updated = await this.db.vocabularyGroup.updateMany({
        where: { id: groupId, userId: req.user },
        data: { ...input, nameKey: normalizeDictionaryKey(input.name) },
      });
      if (!updated.count) throw new NotFoundException("ไม่พบกลุ่มคำศัพท์");
      return this.db.vocabularyGroup.findFirstOrThrow({ where: { id: groupId, userId: req.user } });
    });
  }

  @Delete("groups/:groupId")
  async deleteGroup(@Req() req: any, @Param("groupId") param: string) {
    const groupId = parse(uuid, param);
    const deleted = await this.db.vocabularyGroup.deleteMany({ where: { id: groupId, userId: req.user } });
    if (!deleted.count) throw new NotFoundException("ไม่พบกลุ่มคำศัพท์");
    return { ok: true };
  }

  @Post("words")
  async createWord(@Req() req: any, @Body() body: unknown) {
    const input = parse(wordSchema.extend({ groupId: uuid }), body);
    await this.ownedGroup(req.user, input.groupId);
    const { groupId, ...fields } = input;
    return this.unique(() => this.db.vocabularyWord.create({
      data: { groupId, ...fields, wordKey: normalizeDictionaryKey(fields.word) },
    }));
  }

  @Patch("words/:wordId")
  async updateWord(@Req() req: any, @Param("wordId") param: string, @Body() body: unknown) {
    const wordId = parse(uuid, param), input = parse(wordSchema, body);
    return this.unique(async () => {
      const changed = await this.db.vocabularyWord.updateMany({
        where: { id: wordId, group: { userId: req.user } },
        data: { ...input, wordKey: normalizeDictionaryKey(input.word) },
      });
      if (!changed.count) throw new NotFoundException("ไม่พบคำศัพท์");
      return this.db.vocabularyWord.findFirstOrThrow({
        where: { id: wordId, group: { userId: req.user } },
      });
    });
  }

  @Delete("words/:wordId")
  async deleteWord(@Req() req: any, @Param("wordId") param: string) {
    const wordId = parse(uuid, param);
    const deleted = await this.db.vocabularyWord.deleteMany({
      where: { id: wordId, group: { userId: req.user } },
    });
    if (!deleted.count) throw new NotFoundException("ไม่พบคำศัพท์");
    return { ok: true };
  }

  @Post("words/:wordId/reviews")
  async review(@Req() req: any, @Param("wordId") param: string, @Body() body: unknown) {
    const wordId = parse(uuid, param);
    const input = parse(z.object({
      request: uuid, rating: z.number().int().min(1).max(4),
    }).strict(), body);
    return this.db.$transaction(async (tx) => {
      // Serialize updates to this word, while allowing independent words to be reviewed concurrently.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"vocabulary:" + wordId}))`;
      const word = await tx.vocabularyWord.findFirst({
        where: { id: wordId, group: { userId: req.user } },
      });
      if (!word) throw new NotFoundException("ไม่พบคำศัพท์");
      const previous = await tx.vocabularyReview.findUnique({ where: { request: input.request } });
      if (previous) {
        if (previous.wordId !== wordId) throw new ConflictException("รหัสการทบทวนถูกใช้แล้ว");
        return { days: previous.days, dueAt: previous.dueAt, replayed: true };
      }
      const next = nextReview(input.rating, word.days, 5, null);
      await tx.vocabularyWord.update({ where: { id: wordId }, data: next });
      await tx.vocabularyReview.create({
        data: { wordId, request: input.request, rating: input.rating, ...next },
      });
      return { ...next, replayed: false };
    });
  }
}

@Module({ controllers: [DictionaryController] })
export class DictionaryModule {}
