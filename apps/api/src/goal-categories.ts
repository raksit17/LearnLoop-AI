export const DEFAULT_GOAL_CATEGORIES = ["General", "Programming", "English"] as const;

export function normalizeCategoryName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

export function categoryKey(value: string): string {
  return normalizeCategoryName(value).toLowerCase();
}

export function isDefaultCategory(value: string): boolean {
  const key = categoryKey(value);
  return DEFAULT_GOAL_CATEGORIES.some((name) => categoryKey(name) === key);
}
