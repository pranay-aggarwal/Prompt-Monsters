import type { JudgeEvaluation } from "./types";

export function validEvaluation(value: unknown): value is JudgeEvaluation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  const scores = ["relevance", "reasoning", "counterargument", "clarity", "promptQuality"];
  const keys = [...scores, "evidence", "strength", "improvementTip"];
  return Object.keys(data).length === keys.length && Object.keys(data).every(k => keys.includes(k))
    && scores.every(k => typeof data[k] === "number" && Number.isFinite(data[k]) && Number(data[k]) >= 0 && Number(data[k]) <= 100)
    && (data.evidence === null || (typeof data.evidence === "number" && Number.isFinite(data.evidence) && data.evidence >= 0 && data.evidence <= 100))
    && typeof data.strength === "string" && typeof data.improvementTip === "string";
}

export function wantsResearch(text: string) {
  if (/\b(do not|don't|never|without|avoid|no)\s+(?:\w+\s+){0,2}(research|search|look up|find sources)\b/i.test(text)) return false;
  return /\b(research|find (?:reliable )?(?:sources|studies|evidence)|look up|verify (?:this|the claim)|search (?:for|the web))\b/i.test(text);
}
