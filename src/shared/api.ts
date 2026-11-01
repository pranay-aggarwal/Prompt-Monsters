import type { JudgeEvaluation, MonsterId, MonsterTurnOutput, ResearchResult, SelectedTeam } from "./types";

export type BattleTurnResponse =
  | ({ ok: true; mode: "live"; researchResults: ResearchResult[]; researchNotice?: string; researchUsed?: boolean; evaluation: JudgeEvaluation } & MonsterTurnOutput)
  | { ok: false; mode: "offline"; error: string; monsterTurn?: MonsterTurnOutput; researchResults?: ResearchResult[]; researchUsed?: boolean };

export function createBattleSessionId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `battle-${Date.now()}`;
}

export async function battleTurn(input: {
  battleId: string;
  scenarioId: string;
  instruction: string;
  activeMonsterId: MonsterId;
  partnerMonsterId?: MonsterId;
  selectedMonsterIds: SelectedTeam;
  requestResearch: boolean;
  battleContext: { turn: number; kweenHp: number; kweenShield: number; nextBossMove: string };
}): Promise<BattleTurnResponse> {
  try {
    const response = await fetch("/api/battle/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-battle-id": input.battleId },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(40_000),
    });
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || !("ok" in payload)) throw new Error("Invalid turn response");
    if (!response.ok && !("error" in payload)) throw new Error("Turn unavailable");
    return payload as BattleTurnResponse;
  } catch {
    return { ok: false, mode: "offline", error: "Live AI unavailable. Continue in Offline Practice Mode." };
  }
}
