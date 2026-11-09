/** Consistent case-/width-insensitive dictionary duplicate keys. */
export function normalizeDictionaryKey(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
}

/** Distinguish the target word from a valid synonym in its meaning group. */
export function compareDictionaryAnswer(
  answer: string,
  target: string,
  otherWords: string[],
): "exact" | "synonym" | "different" {
  const key = normalizeDictionaryKey(answer);
  if (!key) return "different";
  if (key === normalizeDictionaryKey(target)) return "exact";
  return otherWords.some((word) => normalizeDictionaryKey(word) === key)
    ? "synonym"
    : "different";
}
