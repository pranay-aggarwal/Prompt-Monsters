export type MonsterId = "soli" | "astra" | "giptoo" | "sori" | "coddy";
export type BossId = "kween";

export interface MonsterDefinition {
  id: MonsterId;
  name: string;
  inspiration: string;
  description: string;
  personality: string;
  primaryColor: string;
  sprite: string;
  abilityId: string;
  abilityName: string;
  abilityDescription: string;
}

export type SelectedTeam = [MonsterId, MonsterId, MonsterId];

export type BattleActionId =
  | "basic_attack"
  | "soli_echo_cheer"
  | "astra_galaxy_brain"
  | "giptoo_pattern_echo"
  | "sori_scene_shift"
  | "coddy_patch_pounce"
  | "invalid_action";

export interface SuggestedMonsterAction {
  monsterId: MonsterId;
  actionId: BattleActionId;
}

export interface EvaluatorSuggestion {
  actions: SuggestedMonsterAction[];
  explanation: string;
}

export interface ResearchResult {
  id: string;
  title: string;
  url: string;
  domain: string;
  publishedDate: string | null;
  excerpt: string | null;
}
