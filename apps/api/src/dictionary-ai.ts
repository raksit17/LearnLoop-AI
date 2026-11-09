import { z } from "zod";
import { normalizeDictionaryKey } from "./dictionary-utils";

// Accept words, phrasal verbs and short multi-word English expressions (up to 6 words).
// Canonicalize whitespace for consistent lookup and duplicate detection.
export const dictionaryLookupWord = z.string().trim().min(1).max(120)
  .transform(value => value.replace(/[ \t]+/gu, " ").replace(/\u2019/gu, "'"))
  .refine(
    value => /^[a-zA-Z]+(?:[-'][a-zA-Z]+)*(?: [a-zA-Z]+(?:[-'][a-zA-Z]+)*){0,5}$/.test(value),
    "กรุณาพิมพ์คำศัพท์หรือวลีภาษาอังกฤษไม่เกิน 6 คำ เช่น give up หรือ look after",
  );

export const dictionaryWordSuggestion = z.object({
  word: z.string().trim().min(1).max(120),
  meaning: z.string().trim().min(1).max(500),
  partOfSpeech: z.enum(["noun", "verb", "phrasal_verb", "adjective", "adverb", "phrase", "other"]),
  pronunciation: z.string().trim().max(120),
  example: z.string().trim().max(1200),
  exampleTranslation: z.string().trim().max(1200),
  nuance: z.string().trim().max(1200),
}).strict();

export const dictionarySuggestion = z.object({
  groupName: z.string().trim().min(1).max(100),
  groupDescription: z.string().trim().max(1000),
  words: z.array(dictionaryWordSuggestion).min(1).max(5),
}).strict();

export function verifyDictionarySuggestion(raw: unknown, requestedWord: string) {
  const suggestion = dictionarySuggestion.parse(raw);
  const keys = suggestion.words.map((word) => normalizeDictionaryKey(word.word));
  if (new Set(keys).size !== keys.length)
    throw Error("AI สร้างคำศัพท์ซ้ำในกลุ่ม กรุณาสร้างใหม่");
  if (!keys.includes(normalizeDictionaryKey(requestedWord)))
    throw Error("AI ไม่ได้ใส่คำที่ต้องการ กรุณาสร้างใหม่");
  return suggestion;
}

export function makeVocabularyCloze(example: string, word: string): string | null {
  const target = word.trim();
  if (!target || !example) return null;
  const escaped = target.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
  const pattern = new RegExp("(?<![\\p{L}])" + escaped + "(?![\\p{L}])", "iu");
  return pattern.test(example) ? example.replace(pattern, "_____") : null;
}
