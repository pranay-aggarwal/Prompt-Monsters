import { BATTLE_CONFIG as C } from "../shared/battleConfig";
import { MONSTERS } from "../shared/monsters";
import { KWEEN_SCENARIOS } from "../shared/scenarios";
import type { BattleActionId, JudgeEvaluation, MonsterId, MonsterTurnOutput, ResearchResult, SelectedTeam } from "../shared/types";
import { validEvaluation, wantsResearch } from "../shared/turnValidation";
export { validEvaluation, wantsResearch } from "../shared/turnValidation";

export type MoveId = typeof C.kweenPattern[number];
export const MOVE_NAMES: Record<MoveId, string> = { benchmark_brag: "Benchmark Brag", score_surge: "Score Surge", royal_strike: "Royal Strike" };
export type TurnRecord = {
  turn: number; prompt: string; activeId: MonsterId; output: MonsterTurnOutput; evaluation: JudgeEvaluation;
  score: number; impact: number; events: string[]; evidence: ResearchResult[]; mode: "offline" | "live"; notice: string;
};
export type BattleState = {
  team: { id: MonsterId; hp: number }[]; scenarioId: string; activeMonsterId: MonsterId;
  kweenHp: number; kweenShield: number; turn: number; patternIndex: number; decoyActive: boolean;
  damageReduction: number; bonusDamage: number; revealedMove: MoveId | null;
  mode: "offline" | "live"; liveTurnsUsed: number; researchUsed: boolean; history: TurnRecord[];
  status: "active" | "victory" | "defeat";
};
export const monsterFor = (id: MonsterId) => MONSTERS.find(m => m.id === id)!;
export const scenarioFor = (id: string) => KWEEN_SCENARIOS.find(s => s.id === id) ?? KWEEN_SCENARIOS[0];
export const nextMove = (s: BattleState) => C.kweenPattern[s.patternIndex % C.kweenPattern.length];

export function createBattle(team: SelectedTeam, scenarioId: string): BattleState {
  if (team.length !== 3 || new Set(team).size !== 3 || team.some(id => !monsterFor(id))) throw new Error("Choose exactly three different monsters.");
  return { team: team.map(id => ({ id, hp: C.playerMonsterMaxHp })), scenarioId: scenarioFor(scenarioId).id,
    activeMonsterId: team[0], kweenHp: C.kweenMaxHp, kweenShield: C.kweenStartingShield,
    turn: 1, patternIndex: 0, decoyActive: false, damageReduction: 0, bonusDamage: 0, revealedMove: null,
    mode: "offline", liveTurnsUsed: 0, researchUsed: false, history: [], status: "active" };
}

export function scoreEvaluation(e: JudgeEvaluation) {
  const w = C.evaluationWeights;
  const availableWeight = e.evidence === null ? 1 - w.evidence : 1;
  const argument = (e.relevance * w.relevance + e.reasoning * w.reasoning + e.counterargument * w.counterargument + (e.evidence ?? 0) * w.evidence + e.clarity * w.clarity) / availableWeight;
  return argument * w.argument + e.promptQuality * w.prompt;
}
export const damageForScore = (score: number) => [...C.damageBands].reverse().find(b => score >= b.minimum)?.damage ?? C.damageBands[0].damage;

export function requestedPartner(state: BattleState, text: string, selected?: MonsterId): MonsterId | undefined {
  const mentioned = MONSTERS.filter(m => m.id !== state.activeMonsterId && new RegExp(`\\b${m.name}\\b`, "i").test(text));
  if (mentioned.length > 1) throw new Error("One teammate can help per turn. Choose just one partner.");
  if (mentioned.some(m => !state.team.some(t => t.id === m.id && t.hp > 0))) throw new Error("That partner isn't on your living team. Ask one of your available teammates.");
  if (selected && !state.team.some(t => t.id === selected && t.id !== state.activeMonsterId && t.hp > 0)) throw new Error("Choose a different living helper.");
  if (selected && mentioned.length && mentioned[0].id !== selected) throw new Error("Your prompt names a different helper. Match the helper to your instruction.");
  if (selected && !mentioned.length && !/\b(collaborate|together|team up|work with|help each other)\b/i.test(text)) throw new Error(`Ask ${monsterFor(selected).name} to help in your instruction, or choose Solo.`);
  return mentioned[0]?.id ?? selected;
}

const practiceArguments: Record<string, string[]> = {
  "benchmark-general-intelligence": [
    "A benchmark shows how a system performs on the tasks it measures. It can be useful evidence, but a single score doesn't establish performance on unfamiliar tasks. Compare several task types and test on held-out examples before generalising.",
    "The hidden assumption is that success on one task transfers to every kind of intelligence. That needs testing. A high score supports a narrower claim about the benchmark; unfamiliar tasks, robustness checks, and possible training overlap help test the broader claim.",
    "Counterexample detected: a system can memorise a test pattern and still fail when the problem changes. That's a hypothesis to investigate, not proof of memorisation here. Try new tasks and compare the results before making a general claim.",
    "Imagine crowning the best swimmer the best athlete at every sport. The swimming result is real; the leap is too big. Test the AI on different, unfamiliar tasks before deciding how far its benchmark success carries.",
    "Test plan: define the capability, use unfamiliar tasks across several domains, check for training overlap, and compare errors. One benchmark is a useful measurement. General intelligence is a broader conclusion that needs broader support."
  ],
  "confident-citations-trust": [
    "A confident answer can still be mistaken. Citations help us check it, but only if they exist and support the actual claim. Open a source, compare its meaning to the answer, and check the date before relying on it.",
    "Separate three questions: is the answer confident, does the source exist, and does the source support the claim? Only the latter two help verify it. The right level of checking depends on the consequences of an error.",
    "A familiar pattern: fluent wording makes uncertain claims feel solid. Predict a failure case by checking whether a quoted source says something narrower. A real citation can still be misrepresented.",
    "A citation is a signpost, not the destination. Follow it and see whether it leads to the evidence the answer promises. Confidence may make an answer easier to read, but verification makes it safer to use.",
    "Verification checklist: open the cited source, confirm the author and date, locate the supporting passage, and compare the scope of its conclusion. If a key claim is unsupported, qualify it or seek better evidence."
  ],
  "longer-prompts-better": [
    "More detail helps when it gives useful context. Extra instructions can also distract or conflict. Start with a clear goal and add only details that help someone recognise a good answer.",
    "The word 'always' assumes every added detail improves the task. Irrelevant or conflicting details can undermine that. Compare a short and long version on the same task using the same success criteria.",
    "Prediction: a longer prompt with conflicting constraints may perform worse than a short, clear one. Test both on the same examples. Length is a variable; useful instructions are the mechanism.",
    "Think of a map covered in so many labels that you can't see the route. Relevant detail helps; clutter hides the destination. Try a shorter prompt with one goal and a clear example of success.",
    "Build a fair comparison: hold the task and success criteria fixed, remove irrelevant details, and compare the outputs. Add context only when it resolves a real ambiguity. Length alone is not a quality check."
  ]
};

export function offlineTurn(state: BattleState, instruction: string, partner?: MonsterId): { output: MonsterTurnOutput; evaluation: JudgeEvaluation } {
  const text = instruction.trim();
  if (text.split(/\s+/).length < 4 || !/\b(analy[sz]e|identify|challenge|check|test|verify|compare|explain|define|protect|predict|reveal|break|heal|argue|assess|evaluate|summari[sz]e|reframe|reason|investigate|research|find|use|tell|give|show|help|consider|critique|build|think|discuss|qualify|describe|debunk|explore)\b/i.test(text)) throw new Error("Give your monster a task: what should it examine about Kween's claim, and how should it check the answer?");
  const active = monsterFor(state.activeMonsterId);
  const context = /\b(claim|kween|benchmark|intelligence|citation|confidence|confident|source|trust|prompt|detail|length)\b/i.test(text);
  const reasoning = /\b(why|because|assumption|reason|compare|test|explain|if|when|condition|limit|alternative|counterexample)\b/i.test(text);
  const nuance = /\b(limit|however|but|assumption|alternative|always|depends|condition|could|when|whether|qualify|fails)\b/i.test(text);
  const constraint = /\b(one|two|three|short|concise|sentence|specific|testable|success|check|compare|before|without)\b/i.test(text);
  const evaluation: JudgeEvaluation = {
    relevance: context ? 82 : 36, reasoning: reasoning ? 80 : 42, counterargument: nuance ? 80 : 38,
    evidence: scenarioFor(state.scenarioId).evidenceRequirement === "required" ? 20 : null,
    clarity: text.length <= 650 ? 82 : 62, promptQuality: Math.min(100, 25 + (context ? 20 : 0) + (reasoning ? 20 : 0) + (constraint ? 20 : 0) + (wantsResearch(text) ? 10 : 0)),
    strength: context && reasoning ? "You gave a relevant task and asked for reasoning." : context ? "Your instruction connects to the claim." : "You gave your monster a task to work on.",
    improvementTip: !context ? "Name the part of Kween's claim you want examined." : !reasoning ? "Ask why the claim holds, or how to test an assumption." : !nuance ? "Ask for a condition where the claim holds and one where it fails." : !constraint ? "Give a clear success condition, such as one testable counterexample." : "Compare this response with your own conclusion. What would change your mind?"
  };
  const index = MONSTERS.findIndex(m => m.id === active.id);
  const openings = ["Let's make this a little clearer!", "There's an assumption hiding in that crown.", "B-beep. Pattern spotted!", "Let's look at it from another angle.", "Let's check this, step by step."];
  const proposedActions = [{ monsterId: active.id, actionId: active.abilityId as BattleActionId }, ...(partner ? [{ monsterId: partner, actionId: monsterFor(partner).abilityId as BattleActionId }] : [])];
  const predictionText = /royal strike/i.test(text) ? "royal_strike" : /score surge/i.test(text) ? "score_surge" : /benchmark brag/i.test(text) ? "benchmark_brag" : nextMove(state);
  return { output: { monsterResponse: `${openings[index]}${partner ? ` ${monsterFor(partner).name}, let's work together.` : ""}`, argument: practiceArguments[state.scenarioId]?.[index] ?? practiceArguments[KWEEN_SCENARIOS[0].id][index], proposedActions, predictedMove: proposedActions.some(a => a.monsterId === "giptoo") ? predictionText : null }, evaluation };
}

type TurnInput = { instruction: string; partner?: MonsterId; output: MonsterTurnOutput; evaluation: JudgeEvaluation; mode: "live" | "offline"; evidence?: ResearchResult[]; researchUsed?: boolean; notice?: string };

export function resolveTurn(state: BattleState, input: TurnInput): BattleState {
  const { output, evaluation, partner } = input;
  if (state.status !== "active" || !state.team.some(m => m.id === state.activeMonsterId && m.hp > 0)) throw new Error("Choose a living active monster.");
  if (!validEvaluation(evaluation)) throw new Error("The evaluation was invalid. No turn was used.");
  if (requestedPartner(state, input.instruction, partner) !== partner) throw new Error("The helper must match your instruction.");
  const actions = output.proposedActions;
  if (!Array.isArray(actions) || actions.length < 1 || actions.length > 2 || new Set(actions.map(a => a.monsterId)).size !== actions.length || !actions.some(a => a.monsterId === state.activeMonsterId)) throw new Error("The response proposed an invalid team action.");
  for (const a of actions) {
    if (!state.team.some(m => m.id === a.monsterId && m.hp > 0) || !monsterFor(a.monsterId) || monsterFor(a.monsterId).abilityId !== a.actionId || (a.monsterId !== state.activeMonsterId && a.monsterId !== partner)) throw new Error("That ability isn't available to this turn's team.");
  }
  const usesPrediction = actions.some(a => a.monsterId === "giptoo");
  if (usesPrediction ? !C.kweenPattern.includes(output.predictedMove as MoveId) : output.predictedMove !== null) throw new Error("Pattern Echo needs a valid move prediction.");
  const s: BattleState = { ...state, team: state.team.map(m => ({ ...m })), history: [...state.history], mode: input.mode,
    liveTurnsUsed: state.liveTurnsUsed + (input.mode === "live" ? 1 : 0), researchUsed: state.researchUsed || !!input.researchUsed };
  const events: string[] = [];
  const score = scoreEvaluation(evaluation);
  const impact = damageForScore(score) + s.bonusDamage;
  s.bonusDamage = 0;
  const shield = s.kweenShield;
  s.kweenShield = Math.max(0, shield - impact);
  s.kweenHp = Math.max(0, s.kweenHp - Math.max(0, impact - shield));
  events.push(`Your argument deals ${impact} impact (${Math.min(shield, impact)} shield, ${Math.max(0, impact - shield)} HP).`);
  const heal = (amount: number, name: string) => {
    const target = s.team.filter(m => m.hp > 0).sort((a, b) => a.hp - b.hp)[0];
    if (!target) return;
    const restored = Math.min(amount, C.playerMonsterMaxHp - target.hp);
    target.hp += restored; events.push(`${name} restores ${restored} HP to ${monsterFor(target.id).name}.`);
  };
  const correct = output.predictedMove === nextMove(s);
  for (const action of actions) {
    switch (action.monsterId) {
      case "soli": heal(C.abilityValues.soliHeal, "Echo Cheer"); break;
      case "astra": s.bonusDamage = C.abilityValues.astraBonusDamage; s.revealedMove = nextMove(s); events.push(`Galaxy Brain marks a weakness: +${s.bonusDamage} impact next turn.`); break;
      case "giptoo": if (correct) { s.damageReduction = C.abilityValues.giptooDamageReduction; events.push(`Pattern Echo correctly predicts ${MOVE_NAMES[nextMove(s)]}. The next hit is reduced by 10.`); } else events.push("Giptoo: B-beep. That was my prediction for a different universe. No protection this turn."); break;
      case "sori": s.decoyActive = true; events.push("Scene Shift creates a decoy for the next Royal Strike."); break;
      case "coddy": {
        const removed = Math.min(C.abilityValues.coddyShieldRemoval, s.kweenShield);
        if (removed) { s.kweenShield -= removed; events.push(`Patch Pounce removes ${removed} shield.`); }
        else { s.kweenHp = Math.max(0, s.kweenHp - C.abilityValues.coddyDirectDamage); events.push(`Patch Pounce deals ${C.abilityValues.coddyDirectDamage} direct HP damage.`); }
        break;
      }
    }
  }
  const ids = new Set(actions.map(a => a.monsterId));
  if (ids.has("astra") && ids.has("coddy")) { const extra = Math.min(C.abilityValues.astraCoddyShieldBonus, s.kweenShield); s.kweenShield -= extra; events.push(`Weakness Exploit! ${extra} extra shield removed.`); }
  if (ids.has("giptoo") && ids.has("sori") && correct) { s.decoyActive = true; events.push("Misdirection! A correct prediction and a very convincing decoy."); }
  if (partner === "soli" && ids.has("soli")) heal(C.abilityValues.soliAssistHeal, "Echo Assist");
  if (s.kweenHp <= 0) s.status = "victory";
  else {
    const move = nextMove(s);
    if (move !== "royal_strike") { const gain = Math.min(C.abilityValues.kweenShieldGain, C.kweenMaxShield - s.kweenShield); s.kweenShield += gain; events.push(`Kween uses ${MOVE_NAMES[move]}: +${gain} shield. “My numbers are impeccable!”`); }
    else if (s.decoyActive) { s.decoyActive = false; events.push("Royal Strike hits Sori's decoy. Your team takes no damage!"); }
    else { const target = s.team.find(m => m.id === s.activeMonsterId && m.hp > 0)!; const damage = Math.max(0, C.abilityValues.kweenRoyalStrikeDamage - s.damageReduction); target.hp = Math.max(0, target.hp - damage); events.push(`Royal Strike! ${monsterFor(target.id).name} takes ${damage} damage.`); }
    if (move === "royal_strike") s.damageReduction = 0;
    s.patternIndex++; s.revealedMove = ids.has("astra") ? nextMove(s) : null;
    if (s.team.every(m => m.hp <= 0)) s.status = "defeat";
    else if (!s.team.some(m => m.id === s.activeMonsterId && m.hp > 0)) { s.activeMonsterId = s.team.find(m => m.hp > 0)!.id; events.push(`${monsterFor(s.activeMonsterId).name} steps in!`); }
  }
  s.history.push({ turn: s.turn, prompt: input.instruction, activeId: state.activeMonsterId, output, evaluation, score, impact, events, evidence: input.evidence ?? [], mode: input.mode, notice: input.notice ?? "" });
  s.turn++;
  return s;
}
