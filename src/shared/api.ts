import type { JudgeEvaluation, MonsterId, MonsterTurnOutput, ResearchResult, SelectedTeam } from "./types";

export type BattleTurnResponse =
  | ({ ok: true; mode: "live"; researchResults: ResearchResult[]; researchNotice?: string; evaluation: JudgeEvaluation } & MonsterTurnOutput)
  | { ok: false; mode: "offline"; error: string };

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
    });
    const payload = (await response.json()) as BattleTurnResponse;
    return response.ok ? payload : { ok: false, mode: "offline", error: "error" in payload ? payload.error : "Live AI unavailable." };
  } catch {
    return { ok: false, mode: "offline", error: "Live AI unavailable. Continue in Offline Practice Mode." };
  }
}
