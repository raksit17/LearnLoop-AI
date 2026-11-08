/**
 * Deduplicate by the question itself, regardless of answer, quote, or kind.
 * This catches equivalent Unicode, casing, whitespace and trailing question punctuation.
 * It deliberately preserves operators/punctuation inside programming questions.
 */
export function normalizeQuestionPrompt(prompt: string): string {
  return prompt
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .replace(/[?？!！]+$/u, "")
    .trim();
}

export function selectUniqueQuestions<T extends { prompt: string }>(
  existingPrompts: readonly string[],
  generated: readonly T[],
): T[] {
  const seen = new Set(existingPrompts.map(normalizeQuestionPrompt));
  const unique: T[] = [];
  for (const question of generated) {
    const normalized = normalizeQuestionPrompt(question.prompt);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(question);
  }
  return unique;
}
