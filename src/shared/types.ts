export type MonsterId = "soli" | "astra" | "giptoo" | "sori" | "coddy";
export type BossId = "kween";
export type AIProviderId = "openai" | "cerebras";

export interface MonsterDefinition {
  id: MonsterId;
  name: string;
  inspiration: string;
  description: string;
  personality: string;
  reasoningApproach: string;
  voiceStyle: string;
  promptGuardrails: string[];
  primaryColor: string;
  sprite: string;
  abilityId: string;
  abilityName: string;
  abilityDescription: string;
}

export type SelectedTeam = [MonsterId, MonsterId, MonsterId];

export interface ChallengeScenario {
  id: string;
  bossId: BossId;
  claim: string;
  context: string;
  difficulty: "easy" | "medium" | "hard";
  rubric: string[];
  evidenceRequirement: "required" | "recommended" | "optional";
}

export interface PlayerTurnInstruction {
  scenarioId: string;
  instruction: string;
  activeMonsterId: MonsterId;
  partnerMonsterId?: MonsterId;
  selectedMonsterIds: SelectedTeam;
  requestResearch: boolean;
}

export type BattleActionId =
  | "soli_echo_cheer"
  | "astra_galaxy_brain"
  | "giptoo_pattern_echo"
  | "sori_scene_shift"
  | "coddy_patch_pounce";

export interface ProposedMonsterAction {
  monsterId: MonsterId;
  actionId: BattleActionId;
}

export interface MonsterTurnOutput {
  monsterResponse: string;
  argument: string;
  proposedActions: ProposedMonsterAction[];
  predictedMove: "benchmark_brag" | "score_surge" | "royal_strike" | null;
}

export interface JudgeEvaluation {
  relevance: number;
  reasoning: number;
  counterargument: number;
  evidence: number | null;
  clarity: number;
  promptQuality: number;
  strength: string;
  improvementTip: string;
}

export interface ResearchResult {
  id: string;
  title: string;
  url: string;
  domain: string;
  publishedDate: string | null;
  excerpt: string | null;
}

export interface AIProviderConfig {
  provider: AIProviderId;
  model: string;
  judgeModel?: string;
}
