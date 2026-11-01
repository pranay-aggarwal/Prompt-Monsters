import type { EvaluatorSuggestion, MonsterId, ResearchResult } from "./types";

type ApiFailure = { ok: false; error: string };
export type ResearchResponse = { ok: true; results: ResearchResult[] } | ApiFailure;
export type InterpretResponse = ({ ok: true } & EvaluatorSuggestion) | ApiFailure;

export function createBattleSessionId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `battle-${Date.now()}`;
}

async function postJson<T>(path: string, body: unknown, battleId: string): Promise<T | ApiFailure> {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-battle-id": battleId },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as T | ApiFailure;
    const error = typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string" ? payload.error : "Optional provider unavailable.";
    return response.ok ? payload : { ok: false, error };
  } catch {
    return { ok: false, error: "Optional provider unavailable. Continue with the local evaluator." };
  }
}

export function searchEvidence(query: string, battleId: string) {
  return postJson<ResearchResponse>("/api/research/search", { query, maxResults: 3 }, battleId) as Promise<ResearchResponse>;
}

export function interpretBattle(input: {
  instruction: string;
  selectedMonsterIds: MonsterId[];
  battleSummary: string;
  evidence: ResearchResult[];
  battleId: string;
}) {
  return postJson<InterpretResponse>("/api/battle/interpret", { ...input, bossId: "kween" }, input.battleId) as Promise<InterpretResponse>;
}
