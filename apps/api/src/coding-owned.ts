import { Database } from "./core";
import { Exercise, findExercise } from "./coding-exercises";

const personal = /^custom-([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i;

export function customExercise(row: {
  id: string; title: string; prompt: string; hint: string; example: string;
  skill: string; level: number; cases: unknown;
}): Exercise {
  return {
    id: "custom-" + row.id,
    title: row.title,
    prompt: row.prompt,
    hint: row.hint,
    example: row.example,
    skill: row.skill,
    level: row.level,
    cases: row.cases as [unknown, unknown][],
  };
}

export async function ownedExercise(db: Database, userId: string, id: string): Promise<Exercise | undefined> {
  const builtIn = findExercise(id);
  if (builtIn) return builtIn;
  const key = personal.exec(id)?.[1];
  if (!key) return undefined;
  const row = await db.codingExercise.findFirst({ where: { id: key, userId } });
  return row && Array.isArray(row.cases) && row.cases.length === 3 ? customExercise(row) : undefined;
}
