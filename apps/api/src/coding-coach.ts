import { ServiceUnavailableException } from "@nestjs/common";
import { z } from "zod";
import { askJson } from "./ai/provider";
import { Exercise } from "./coding-exercises";

export const kinds = z.enum(["hint1","hint2","hint3","review","visual"]);
export type Kind = z.infer<typeof kinds>;
const topics = ["Correctness","Readability","Performance","Security","Maintainability"] as const;
const string = { type: "string" };
const integer = { type: "integer", minimum: 1 };
function object(properties: Record<string, unknown>) {
  return { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
}
const text = z.string().trim().min(1).max(2500);
export async function coach(kind: Kind, ex: Exercise, row: {answer:string; passed:number; total:number; failedCases:number[]}) {
  const lines = row.answer.split(/\r?\n/);
  const line = z.number().int().min(1).max(lines.length);
  const finding = z.object({ line, feedback: text });
  const step = z.object({ line, event: text, variables: text, stack: text, flow: text, condition:z.string().max(500), yes:z.string().max(500), no:z.string().max(500) });
  const source = lines.map((value,index) => (index + 1) + ' ' + value).join('\n');
  const probe = ex.cases[row.failedCases[0] ?? 0];
  const payload = { task: ex.prompt, source, cases: ex.cases, probe, passed:row.passed, total:row.total,
    failedCaseIndices:row.failedCases, ...(ex.skill === "async" ? {lookup:"negative rejects, 1 resolves Ada, 3 resolves Lin, other IDs resolve null"} : {}) };
  const instructions = {
    hint1: "Ask just one short Socratic question about the failure. No answer, pseudocode or code.",
    hint2: "Point to one specific strategy grounded in their code and tests. Do not give code or a complete solution.",
    hint3: "Give a small analogous code example using different input or domain, followed by reasoning. Do not rewrite their submission.",
    review: "Review all five dimensions independently. For each give one real line number and actionable evidence. Mention uncertainty and do not invent security issues. Treat the reported score as test evidence, not proof.",
    visual: "Simulate the submitted code for probe[0], whose expected output is probe[1]. Describe chronological steps including actual line, branch/loop, variable values, call stack and data movement. Show await/resume or controller/service/database boundaries only when supported. For an if or loop test, put its expression in condition and both possible destinations in yes and no. Otherwise return empty strings for those three fields. Label inference. Explain early exit or exception if applicable."
  };
  const field = object({ line: integer, feedback: string });
  const item = object({ line:integer, event:string, variables:string, stack:string, flow:string, condition:string, yes:string, no:string });
  const format = kind === "review" ? object(Object.fromEntries(topics.map(key => [key, field]))) :
    kind === "visual" ? object({steps:{type:"array",items:item,minItems:1,maxItems:10}}) : object({hint:string});
  try {
    const raw = await askJson("Answer in Thai. Line numbers refer to the supplied answer. " + instructions[kind], payload, format);
    if (kind === "visual") return z.object({steps:z.array(step).min(1).max(10)}).parse(raw);
    if (kind === "review") return Object.fromEntries(topics.map(key => [key, finding.parse(raw[key])]));
    return z.object({hint:text}).parse(raw);
  } catch {
    throw new ServiceUnavailableException("ยังสร้างคำแนะนำไม่ได้ ตรวจ Ollama แล้วลองอีกครั้ง");
  }
}
