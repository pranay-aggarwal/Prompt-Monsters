import { useEffect, useMemo, useState } from "react";
import { battleTurn, createBattleSessionId, type BattleTurnResponse } from "./shared/api";
import { BATTLE_CONFIG } from "./shared/battleConfig";
import { MONSTERS } from "./shared/monsters";
import { KWEEN_SCENARIOS } from "./shared/scenarios";
import type { AppScreen } from "./shared/navigation";
import type { BattleActionId, ChallengeScenario, JudgeEvaluation, MonsterDefinition, MonsterId, MonsterTurnOutput, ProposedMonsterAction, ResearchResult, SelectedTeam } from "./shared/types";

type Position = { x: number; y: number };
type Direction = "down" | "left" | "right" | "up";
type Tile = "grass" | "path" | "flower" | "tree" | "pond" | "rock" | "portal" | "sign" | "npc";
type KweenMoveId = (typeof BATTLE_CONFIG.kweenPattern)[number];
type BattleMonsterState = { id: MonsterId; hp: number };
type BattleState = {
  team: BattleMonsterState[];
  scenarioId: string;
  activeMonsterId: MonsterId;
  kweenHp: number;
  kweenShield: number;
  turn: number;
  patternIndex: number;
  log: string[];
  decoyActive: boolean;
  damageReduction: number;
  revealedMove: KweenMoveId | null;
  weaknessRevealed: boolean;
  bonusDamage: number;
  mode: "offline" | "live";
  liveTurnsUsed: number;
  researchUsed: boolean;
  lastResponse: MonsterTurnOutput | null;
  lastEvaluation: JudgeEvaluation | null;
  lastPrompt: string;
  lastEvidence: ResearchResult[];
  status: "active" | "victory" | "defeat";
};

const tileSize = 34;
const meadowWidth = 16;
const meadowHeight = 11;
const startPosition = { x: 2, y: 8 };
const npcPosition = { x: 4, y: 6 };
const signPosition = { x: 11, y: 7 };
const collectionPosition = { x: 2, y: 2 };
const portalPosition = { x: 13, y: 5 };
const obstacles = new Set(["0,0", "1,0", "2,0", "3,0", "4,0", "5,0", "6,0", "7,0", "8,0", "9,0", "10,0", "11,0", "12,0", "13,0", "14,0", "15,0", "0,1", "15,1", "0,2", "5,2", "6,2", "12,2", "15,2", "0,3", "12,3", "15,3", "0,4", "3,4", "9,4", "10,4", "15,4", "0,5", "3,5", "9,5", "10,5", "15,5", "0,6", "15,6", "0,7", "6,7", "15,7", "0,8", "6,8", "15,8", "0,9", "15,9", "0,10", "1,10", "2,10", "3,10", "4,10", "5,10", "6,10", "7,10", "8,10", "9,10", "10,10", "11,10", "12,10", "13,10", "14,10", "15,10"]);
const terrain = new Map<string, Tile>([["2,2", "sign"], ["4,6", "npc"], ["11,7", "sign"], ["13,5", "portal"], ["7,1", "flower"], ["8,1", "flower"], ["2,3", "flower"], ["5,8", "flower"], ["12,8", "flower"], ["9,4", "pond"], ["10,4", "pond"], ["9,5", "pond"], ["10,5", "pond"], ["5,2", "tree"], ["6,2", "tree"], ["12,2", "tree"], ["3,4", "rock"], ["3,5", "rock"], ["6,7", "tree"], ["6,8", "tree"]]);
const npcLines = ["Welcome to Prompt Meadow.", "The meadow's five partners practise different ways of thinking.", "Choose a living partner, give it a clear instruction, and improve your prompt when Kween pushes back."];
const kweenMoveNames: Record<KweenMoveId, string> = { benchmark_brag: "Benchmark Brag", score_surge: "Score Surge", royal_strike: "Royal Strike" };

function keyOf(position: Position) { return `${position.x},${position.y}`; }
function samePosition(a: Position, b: Position) { return a.x === b.x && a.y === b.y; }
function adjacent(a: Position, b: Position) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1; }
function facing(position: Position, direction: Direction): Position { if (direction === "up") return { x: position.x, y: position.y - 1 }; if (direction === "down") return { x: position.x, y: position.y + 1 }; if (direction === "left") return { x: position.x - 1, y: position.y }; return { x: position.x + 1, y: position.y }; }
function getTile(position: Position): Tile { const tile = terrain.get(keyOf(position)); if (tile) return tile; if ((position.y === 8 && position.x > 1 && position.x < 14) || (position.x === 7 && position.y > 1 && position.y < 9)) return "path"; return "grass"; }
function blocked(position: Position) { return position.x < 0 || position.y < 0 || position.x >= meadowWidth || position.y >= meadowHeight || obstacles.has(keyOf(position)) || samePosition(position, npcPosition); }
function interaction(position: Position, direction: Direction) { const target = facing(position, direction); if (adjacent(position, npcPosition) || samePosition(target, npcPosition)) return "npc"; if (samePosition(position, collectionPosition) || samePosition(target, collectionPosition)) return "collection"; if (samePosition(position, portalPosition) || samePosition(target, portalPosition)) return "battle"; if (samePosition(target, signPosition)) return "sign"; return null; }
function tileLabel(tile: Tile) { return ({ grass: "", path: "", flower: "*", tree: "T", pond: "~", rock: "o", portal: "K", sign: "!", npc: "?" })[tile]; }
function getMonster(id: MonsterId) { return MONSTERS.find((monster) => monster.id === id)!; }
function getScenario(id: string) { return KWEEN_SCENARIOS.find((scenario) => scenario.id === id) ?? KWEEN_SCENARIOS[0]; }
function nextMove(state: BattleState) { return BATTLE_CONFIG.kweenPattern[state.patternIndex % BATTLE_CONFIG.kweenPattern.length]; }
function currentChallenge(state: BattleState) { return getScenario(state.scenarioId); }
function firstLiving(team: BattleMonsterState[]) { return team.find((monster) => monster.hp > 0) ?? null; }
function mostInjured(team: BattleMonsterState[]) { return team.filter((monster) => monster.hp > 0).sort((a, b) => a.hp - b.hp)[0] ?? null; }

function createBattleState(team: SelectedTeam, scenarioId: string): BattleState {
  const scenario = getScenario(scenarioId);
  return { team: team.map((id) => ({ id, hp: BATTLE_CONFIG.playerMonsterMaxHp })), scenarioId: scenario.id, activeMonsterId: team[0], kweenHp: BATTLE_CONFIG.kweenMaxHp, kweenShield: BATTLE_CONFIG.kweenStartingShield, turn: 1, patternIndex: 0, log: ["Kween descends with a crown of score tiles.", `Kween: “${scenario.claim}”`, `Practice goal: ${scenario.context}`], decoyActive: false, damageReduction: 0, revealedMove: null, weaknessRevealed: false, bonusDamage: 0, mode: "offline", liveTurnsUsed: 0, researchUsed: false, lastResponse: null, lastEvaluation: null, lastPrompt: "", lastEvidence: [], status: "active" };
}

function scoreFromEvaluation(evaluation: JudgeEvaluation) {
  const evidenceWeight = evaluation.evidence === null ? 0 : 20;
  const remaining = evaluation.evidence === null ? 1.25 : 1;
  const argument = evaluation.relevance * 0.25 * remaining + evaluation.reasoning * 0.25 * remaining + evaluation.counterargument * 0.2 * remaining + (evaluation.evidence ?? 0) * (evidenceWeight / 100) + evaluation.clarity * 0.1 * remaining;
  return Math.max(0, Math.min(100, argument * 0.85 + evaluation.promptQuality * 0.15));
}
function damageForScore(score: number) { return [...BATTLE_CONFIG.damageBands].reverse().find((band) => score >= band.minimum)?.damage ?? 6; }
function hasWord(text: string, pattern: RegExp) { return pattern.test(text.toLowerCase()); }

function offlineTurn(state: BattleState, instruction: string, partnerMonsterId?: MonsterId): { output: MonsterTurnOutput; evaluation: JudgeEvaluation } {
  const active = getMonster(state.activeMonsterId);
  const text = instruction.toLowerCase();
  const actions: ProposedMonsterAction[] = [{ monsterId: active.id, actionId: active.abilityId as BattleActionId }];
  const partner = partnerMonsterId && state.team.some((member) => member.id === partnerMonsterId && member.hp > 0) ? getMonster(partnerMonsterId) : null;
  if (partner && (text.includes(partner.name.toLowerCase()) || text.includes("collaborate") || text.includes("together"))) actions.push({ monsterId: partner.id, actionId: partner.abilityId as BattleActionId });
  const goal = hasWord(text, /\b(identify|challenge|check|test|solve|verify|compare|explain|define|protect|predict|reveal|break|heal)\b/);
  const context = hasWord(text, /\b(kween|claim|benchmark|score|citation|answer|prompt|shield|attack|team)\b/);
  const constraint = hasWord(text, /\b(only|if|when|with|without|before|after|must|specific|condition|then)\b/);
  const evidence = hasWord(text, /\b(evidence|source|research|study|verify|citation|data)\b/);
  const base = (goal ? 25 : 8) + (context ? 25 : 8) + (constraint ? 20 : 8) + (evidence && currentChallenge(state).evidenceRequirement !== "optional" ? 18 : currentChallenge(state).evidenceRequirement === "optional" ? 14 : 5);
  const evaluation: JudgeEvaluation = { relevance: goal && context ? 78 : 42, reasoning: constraint ? 72 : 45, counterargument: hasWord(text, /\b(limit|however|but|assumption|alternative|not always|depends)\b/) ? 78 : 42, evidence: currentChallenge(state).evidenceRequirement === "optional" && !evidence ? null : evidence ? 76 : 30, clarity: instruction.length <= 280 && instruction.trim().split(/\s+/).length >= 3 ? 74 : 42, promptQuality: Math.min(100, base), strength: goal && context ? "The instruction gives the monster a relevant goal and context." : "The instruction points toward an action, but leaves the reasoning task broad.", improvementTip: !goal ? "State the result you want the monster to produce." : !context ? "Name the claim or battle detail the monster should address." : !constraint ? "Add a condition that would let you check whether the answer succeeded." : "Good structure. Keep the conclusion qualified rather than absolute." };
  return { output: { monsterResponse: `${active.name}: ${active.voiceStyle} I will address Kween's claim using my ${active.reasoningApproach.toLowerCase()} ${partner ? `With ${partner.name}, I will combine our approaches.` : ""}`, argument: `Offline practice argument: the claim needs a clear test and relevant context. ${instruction}`, proposedActions: actions }, evaluation };
}

function applyAbility(state: BattleState, action: ProposedMonsterAction, predictionCorrect: boolean) {
  const next = state;
  const actor = getMonster(action.monsterId);
  if (action.actionId === "soli_echo_cheer") { const target = mostInjured(next.team); if (target) { const healed = Math.min(BATTLE_CONFIG.abilityValues.soliHeal, BATTLE_CONFIG.playerMonsterMaxHp - target.hp); target.hp += healed; next.log.push(`Soli's Echo Cheer restores ${healed} HP to ${getMonster(target.id).name}.`); } }
  if (action.actionId === "astra_galaxy_brain") { next.revealedMove = nextMove(next); next.weaknessRevealed = true; next.bonusDamage = BATTLE_CONFIG.abilityValues.astraBonusDamage; next.log.push(`Astra identifies the weakness. The next successful argument gets +${next.bonusDamage} damage.`); }
  if (action.actionId === "giptoo_pattern_echo") { if (predictionCorrect) { next.damageReduction = BATTLE_CONFIG.abilityValues.giptooDamageReduction; next.log.push("Giptoo predicts Royal Strike. The next hit is softened."); } else next.log.push("Giptoo predicts the pattern with a cheerful static burst. Wrong turn, useful data."); }
  if (action.actionId === "sori_scene_shift") { next.decoyActive = true; next.log.push("Sori creates a decoy that can absorb the next Royal Strike."); }
  if (action.actionId === "coddy_patch_pounce") { const removed = Math.min(BATTLE_CONFIG.abilityValues.coddyShieldRemoval, next.kweenShield); if (removed) { next.kweenShield -= removed; next.log.push(`Coddy patches the crown and removes ${removed} shield.`); } else { next.kweenHp = Math.max(0, next.kweenHp - BATTLE_CONFIG.abilityValues.coddyDirectDamage); next.log.push("Coddy exploits the exposed weakness for 10 HP damage."); } }
  return actor;
}

function applyKween(state: BattleState) {
  const next = { ...state, team: state.team.map((member) => ({ ...member })), log: [...state.log] };
  const move = nextMove(next);
  if (move === "benchmark_brag" || move === "score_surge") { next.kweenShield = Math.min(BATTLE_CONFIG.kweenMaxShield, next.kweenShield + BATTLE_CONFIG.abilityValues.kweenShieldGain); next.log.push(`Kween uses ${kweenMoveNames[move]} and restores 5 shield.`); }
  else if (next.decoyActive) { next.decoyActive = false; next.log.push("Kween uses Royal Strike, but Sori's decoy absorbs it."); }
  else { const target = firstLiving(next.team); if (target) { const damage = Math.max(0, BATTLE_CONFIG.abilityValues.kweenRoyalStrikeDamage - next.damageReduction); target.hp = Math.max(0, target.hp - damage); next.log.push(`Kween uses Royal Strike. ${getMonster(target.id).name} takes ${damage} damage.`); } }
  next.damageReduction = 0; next.revealedMove = null; next.patternIndex += 1; next.turn += 1; return next;
}

function updateStatus(state: BattleState) { const next = { ...state, log: [...state.log] }; if (next.kweenHp <= 0) { next.status = "victory"; next.log.push("Kween's crown accepts a narrower definition of intelligence. Victory!"); } else if (next.team.every((member) => member.hp <= 0)) { next.status = "defeat"; next.log.push("The team is out of HP. Improve the instruction and try again."); } next.log = next.log.slice(-12); return next; }

export function App() {
  const [screen, setScreen] = useState<AppScreen>("title");
  const [selectedMonsters, setSelectedMonsters] = useState<MonsterId[]>([]);
  const [battleTeam, setBattleTeam] = useState<SelectedTeam | null>(null);
  const [scenarioId, setScenarioId] = useState(KWEEN_SCENARIOS[0].id);
  const [battleState, setBattleState] = useState<BattleState | null>(null);
  const [player, setPlayer] = useState<Position>(startPosition);
  const [direction, setDirection] = useState<Direction>("down");
  const [dialogueOpen, setDialogueOpen] = useState(false);
  const [dialogueIndex, setDialogueIndex] = useState(0);
  const [notice, setNotice] = useState("Arrow keys or WASD to move. Press E or Enter to interact.");
  const interactionTarget = useMemo(() => interaction(player, direction), [player, direction]);

  useEffect(() => {
    if (screen !== "meadow") return undefined;
    function move(nextDirection: Direction) { setDirection(nextDirection); setDialogueOpen(false); setPlayer((current) => { const next = facing(current, nextDirection); if (blocked(next)) { setNotice("That way is blocked."); return current; } setNotice("Arrow keys or WASD to move. Press E or Enter to interact."); return next; }); }
    function interactNow() { const target = interaction(player, direction); if (target === "npc") { setDialogueOpen(true); setDialogueIndex((current) => dialogueOpen ? (current >= npcLines.length - 1 ? 0 : current + 1) : 0); } if (target === "collection") setScreen("collection"); if (target === "battle") { if (!battleTeam) setNotice("Choose exactly three monsters at the collection shrine first."); else { setBattleState(createBattleState(battleTeam, scenarioId)); setScreen("battle"); } } if (target === "sign") setNotice("A good prompt names the goal, context, constraints, and how to check the result."); }
    function keydown(event: KeyboardEvent) { const key = event.key.toLowerCase(); if (key === "w" || key === "arrowup") { event.preventDefault(); move("up"); } else if (key === "s" || key === "arrowdown") { event.preventDefault(); move("down"); } else if (key === "a" || key === "arrowleft") { event.preventDefault(); move("left"); } else if (key === "d" || key === "arrowright") { event.preventDefault(); move("right"); } else if (key === "e" || key === "enter") { event.preventDefault(); interactNow(); } }
    window.addEventListener("keydown", keydown); return () => window.removeEventListener("keydown", keydown);
  }, [screen, player, direction, dialogueOpen, battleTeam, scenarioId]);

  function beginBattle(team: SelectedTeam) { setBattleTeam(team); setBattleState(createBattleState(team, scenarioId)); setScreen("battle"); }
  if (screen === "title") return <TitleScreen onStart={() => setScreen("meadow")} />;
  if (screen === "meadow") return <MeadowScreen player={player} direction={direction} dialogueOpen={dialogueOpen} dialogueIndex={dialogueIndex} notice={notice} interactionTarget={interactionTarget} onCloseDialogue={() => setDialogueOpen(false)} onNextDialogue={() => setDialogueIndex((current) => Math.min(current + 1, npcLines.length - 1))} onCollection={() => setScreen("collection")} />;
  if (screen === "collection") return <CollectionScreen selected={selectedMonsters} setSelected={setSelectedMonsters} scenarioId={scenarioId} setScenarioId={setScenarioId} onBack={() => setScreen("meadow")} onStart={beginBattle} />;
  if (screen === "battle") return <BattleScreen battleState={battleState} battleTeam={battleTeam} setBattleState={setBattleState} setScreen={setScreen} />;
  return <ResultScreen battleState={battleState} setBattleState={setBattleState} setScreen={setScreen} />;
}

function TitleScreen({ onStart }: { onStart: () => void }) { return <main className="min-h-screen bg-[#102d1f] text-white"><section className="mx-auto flex min-h-screen w-full max-w-4xl flex-col justify-center px-6"><p className="text-sm font-bold uppercase tracking-[0.2em] text-[#f7c948]">A prompt-driven pixel RPG</p><h1 className="mt-4 font-display text-6xl font-black text-[#f7c948]">Prompt Monsters</h1><p className="mt-5 max-w-xl text-xl leading-8 text-[#d9f8df]">They have billions of parameters. You have one good prompt.</p><button className="mt-10 w-fit rounded border-4 border-[#0b1c15] bg-[#f7c948] px-7 py-4 text-lg font-black text-[#102d1f]" type="button" onClick={onStart}>Start New Session</button></section></main>; }

function MeadowScreen({ player, direction, dialogueOpen, dialogueIndex, notice, interactionTarget, onCloseDialogue, onNextDialogue, onCollection }: { player: Position; direction: Direction; dialogueOpen: boolean; dialogueIndex: number; notice: string; interactionTarget: string | null; onCloseDialogue: () => void; onNextDialogue: () => void; onCollection: () => void }) {
  return <main className="min-h-screen bg-[#8bd3a9] p-4 text-[#17251d]"><div className="mx-auto max-w-5xl"><header className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-black uppercase tracking-wide text-[#28623f]">Prompt Meadow</p><h1 className="font-display text-4xl font-black">A small world for big instructions</h1></div><button className="rounded border-2 border-[#0b1c15] bg-[#f7c948] px-4 py-2 font-black" type="button" onClick={onCollection}>Open Collection</button></header><div className="relative overflow-auto rounded border-4 border-[#0b1c15] bg-[#61b77e] p-3"><div className="meadow-grid" style={{ gridTemplateColumns: `repeat(${meadowWidth}, ${tileSize}px)`, gridTemplateRows: `repeat(${meadowHeight}, ${tileSize}px)` }}>{Array.from({ length: meadowWidth * meadowHeight }, (_, index) => { const position = { x: index % meadowWidth, y: Math.floor(index / meadowWidth) }; const tile = getTile(position); const isPlayer = samePosition(position, player); return <div key={keyOf(position)} className={`meadow-tile meadow-tile-${tile} ${isPlayer ? "meadow-player" : ""}`}><span>{isPlayer ? (direction === "left" ? "<" : direction === "right" ? ">" : direction === "up" ? "^" : "v") : tileLabel(tile)}</span></div>; })}</div></div><p className="mt-3 rounded border-2 border-[#28623f] bg-[#d9f8df] p-3 font-bold">{interactionTarget ? `Press E or Enter to interact with ${interactionTarget}.` : notice}</p>{dialogueOpen ? <div className="mt-4 rounded border-4 border-[#0b1c15] bg-[#f5f0d8] p-4"><p className="text-sm font-black uppercase text-[#28623f]">Meadow Guide</p><p className="mt-2 text-lg font-bold">{npcLines[dialogueIndex]}</p><div className="mt-4 flex gap-2"><button className="rounded border-2 border-[#0b1c15] bg-[#f7c948] px-4 py-2 font-black" type="button" onClick={onNextDialogue}>Next</button><button className="rounded border-2 border-[#0b1c15] bg-white px-4 py-2 font-black" type="button" onClick={onCloseDialogue}>Close</button></div></div> : null}</div></main>;
}

function MonsterSprite({ monster, selected = false }: { monster: MonsterDefinition; selected?: boolean }) { return <div className={`monster-sprite monster-sprite-${monster.id} ${selected ? "monster-sprite-selected" : ""}`} aria-label={`${monster.name} temporary pixel sprite`}><span className="monster-face">{monster.id === "coddy" ? "</>" : monster.id === "giptoo" ? "2" : monster.id === "astra" ? "*" : monster.id === "sori" ? "~" : ")"}</span></div>; }
function CollectionScreen({ selected, setSelected, scenarioId, setScenarioId, onBack, onStart }: { selected: MonsterId[]; setSelected: (ids: MonsterId[]) => void; scenarioId: string; setScenarioId: (id: string) => void; onBack: () => void; onStart: (team: SelectedTeam) => void }) { function toggle(id: MonsterId) { setSelected(selected.includes(id) ? selected.filter((value) => value !== id) : selected.length < 3 ? [...selected, id] : selected); } return <main className="min-h-screen bg-[#102d1f] p-5 text-white"><div className="mx-auto max-w-6xl"><header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-black uppercase tracking-wide text-[#f7c948]">Collection Shrine</p><h1 className="font-display text-4xl font-black">Choose three thinking styles</h1></div><button className="rounded border-2 border-[#8bd3dd] bg-[#173f35] px-4 py-2 font-black" type="button" onClick={onBack}>Return to Meadow</button></header><p className="mt-3 max-w-3xl text-[#d9f8df]">Your active monster receives the prompt. A helper can collaborate only when you explicitly ask for it.</p><div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{MONSTERS.map((monster) => { const isSelected = selected.includes(monster.id); return <button key={monster.id} className={`text-left rounded border-4 p-4 ${isSelected ? "border-[#f7c948] bg-[#4b306d]" : "border-[#315c4a] bg-[#173f35]"}`} type="button" onClick={() => toggle(monster.id)}><div className="flex items-center gap-4"><MonsterSprite monster={monster} selected={isSelected} /><div><h2 className="text-2xl font-black">{monster.name}</h2><p className="text-sm font-bold text-[#f7c948]">{monster.abilityName}</p></div></div><p className="mt-3 text-sm text-[#d9f8df]">{monster.personality}</p><p className="mt-2 text-sm text-[#d9f8df]">{monster.reasoningApproach}</p></button>; })}</div><div className="mt-6 rounded border-4 border-[#315c4a] bg-[#173f35] p-4"><label className="block text-sm font-black uppercase tracking-wide text-[#f7c948]" htmlFor="scenario">Kween challenge</label><select id="scenario" className="mt-2 w-full max-w-2xl rounded border-2 border-[#0b1c15] bg-white p-3 font-bold text-[#17251d]" value={scenarioId} onChange={(event) => setScenarioId(event.target.value)}>{KWEEN_SCENARIOS.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.claim}</option>)}</select><p className="mt-3 font-bold">Selected: {selected.length}/3</p><button className="mt-4 rounded border-2 border-[#0b1c15] bg-[#f7c948] px-5 py-3 font-black text-[#102d1f] disabled:opacity-50" type="button" disabled={selected.length !== 3} onClick={() => onStart(selected as SelectedTeam)}>Enter Kween Battle</button></div></div></main>; }

function BattleScreen({ battleState, battleTeam, setBattleState, setScreen }: { battleState: BattleState | null; battleTeam: SelectedTeam | null; setBattleState: (state: BattleState | null) => void; setScreen: (screen: AppScreen) => void }) {
  const [prompt, setPrompt] = useState("");
  const [partner, setPartner] = useState<MonsterId | "">("");
  const [requestResearch, setRequestResearch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [battleId] = useState(createBattleSessionId);
  if (!battleTeam) return <main className="min-h-screen bg-[#102d1f] p-8 text-white">Choose a team first.</main>;
  const state: BattleState = battleState ?? createBattleState(battleTeam, KWEEN_SCENARIOS[0].id);
  const team = battleTeam;
  const scenario = currentChallenge(state);
  const active = getMonster(state.activeMonsterId);
  const living = state.team.filter((member) => member.hp > 0);

  function addLog(stateToUpdate: BattleState, message: string) { return { ...stateToUpdate, log: [...stateToUpdate.log, message].slice(-12) }; }
  async function submitTurn() {
    if (!prompt.trim() || busy || state.status !== "active") return;
    setBusy(true);
    const input = { battleId, scenarioId: state.scenarioId, instruction: prompt.trim(), activeMonsterId: state.activeMonsterId, ...(partner ? { partnerMonsterId: partner } : {}), selectedMonsterIds: team, requestResearch, battleContext: { turn: state.turn, kweenHp: state.kweenHp, kweenShield: state.kweenShield, nextBossMove: kweenMoveNames[nextMove(state)] } };
    const result: BattleTurnResponse = await battleTurn(input);
    let output: MonsterTurnOutput;
    let evaluation: JudgeEvaluation;
    let mode: "live" | "offline" = "offline";
    let evidence: ResearchResult[] = [];
    let notice = "";
    if (result.ok) { output = result; evaluation = result.evaluation; mode = "live"; evidence = result.researchResults; notice = result.researchNotice ?? ""; }
    else { const fallback = offlineTurn(state, prompt.trim(), partner || undefined); output = fallback.output; evaluation = fallback.evaluation; notice = `${result.error} Offline Practice Mode used.`; }
    const validActions = output.proposedActions.filter((action, index) => { const member = state.team.find((value) => value.id === action.monsterId); const expected = getMonster(action.monsterId).abilityId; return index < 2 && member?.hp && member.hp > 0 && action.actionId === expected && (action.monsterId === state.activeMonsterId || action.monsterId === partner); });
    if (!validActions.some((action) => action.monsterId === state.activeMonsterId)) { setBattleState(addLog(state, "That response did not include a legal active-monster action. No state changed.")); setBusy(false); return; }
    const next = { ...state, team: state.team.map((member) => ({ ...member })), log: [...state.log, `${mode === "live" ? "Live AI" : "Offline Practice Mode"}: ${output.monsterResponse}`, `Argument: ${output.argument}`, notice].filter(Boolean), mode, liveTurnsUsed: state.liveTurnsUsed + (mode === "live" ? 1 : 0), researchUsed: state.researchUsed || requestResearch, lastResponse: output, lastEvaluation: evaluation, lastPrompt: prompt.trim(), lastEvidence: evidence };
    const score = scoreFromEvaluation(evaluation);
    const baseDamage = damageForScore(Math.min(100, score + next.bonusDamage));
    next.bonusDamage = 0;
    const shieldBefore = next.kweenShield;
    next.kweenShield = Math.max(0, next.kweenShield - baseDamage);
    next.kweenHp = Math.max(0, next.kweenHp - Math.max(0, baseDamage - shieldBefore));
    next.log.push(`Judge score ${Math.round(score)}/100. The argument deals ${baseDamage} impact.`);
    const predictionCorrect = nextMove(next) === "royal_strike";
    for (const action of validActions) applyAbility(next, action, predictionCorrect);
    const actionIds = new Set(validActions.map((action) => action.actionId));
    if (actionIds.has("astra_galaxy_brain") && actionIds.has("coddy_patch_pounce")) { const extra = Math.min(BATTLE_CONFIG.abilityValues.astraCoddyShieldBonus, next.kweenShield); next.kweenShield -= extra; next.log.push(`Weakness Exploit removes an extra ${extra} shield.`); }
    if (actionIds.has("giptoo_pattern_echo") && actionIds.has("sori_scene_shift") && predictionCorrect) { next.decoyActive = true; next.log.push("Misdirection is ready: Sori's decoy will absorb Royal Strike."); }
    if (partner === "soli" && validActions.some((action) => action.monsterId === "soli") && state.activeMonsterId !== "soli") { const target = mostInjured(next.team); if (target) { const healed = Math.min(BATTLE_CONFIG.abilityValues.soliAssistHeal, BATTLE_CONFIG.playerMonsterMaxHp - target.hp); target.hp += healed; next.log.push(`Echo Assist restores ${healed} HP to ${getMonster(target.id).name}.`); } }
    let completed = updateStatus(next);
    if (completed.status === "active") completed = updateStatus(applyKween(completed));
    setBattleState(completed); setPrompt(""); setPartner(""); setRequestResearch(false); setBusy(false);
  }
  return <main className="min-h-screen bg-[#18122b] p-4 text-white"><div className="mx-auto max-w-7xl"><header className="flex flex-wrap items-end justify-between gap-3 border-b-4 border-[#5b4b8a] pb-4"><div><p className="text-sm font-black uppercase tracking-wide text-[#8bd3dd]">Kween Arena · {state.mode === "live" ? "Live AI Mode" : "Offline Practice Mode"}</p><h1 className="font-display text-4xl font-black">Read. Prompt. Improve.</h1></div><button className="rounded border-2 border-[#8bd3dd] bg-[#173f35] px-4 py-2 font-black" type="button" onClick={() => setScreen("collection")}>Change Team</button></header><div className="mt-4 grid gap-4 xl:grid-cols-[1fr_23rem]"><div className="grid gap-4"><section className="rounded border-4 border-[#0b1c15] bg-[#fff4c2] p-4 text-[#17251d]"><p className="text-xs font-black uppercase tracking-wide text-[#8a5b00]">Kween's claim · {scenario.difficulty}</p><h2 className="mt-1 text-2xl font-black">“{scenario.claim}”</h2><p className="mt-2 font-semibold">{scenario.context}</p><p className="mt-2 text-sm font-bold">Prompt goal: address the claim, explain your reasoning, and give a condition that would let someone check the answer.</p></section><section className="rounded border-4 border-[#0b1c15] bg-[#f5f0d8] p-4 text-[#17251d]"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-4"><div className="kween-sprite" aria-label="Kween temporary pixel sprite">K</div><div><h2 className="text-2xl font-black">Kween</h2><p className="font-bold">HP {state.kweenHp}/{BATTLE_CONFIG.kweenMaxHp} · Shield {state.kweenShield}/{BATTLE_CONFIG.kweenMaxShield}</p><HpBar current={state.kweenHp} max={BATTLE_CONFIG.kweenMaxHp} /></div></div><div className="rounded border-2 border-[#6043a4] bg-white p-3 font-black">Next: {state.revealedMove ? kweenMoveNames[state.revealedMove] : kweenMoveNames[nextMove(state)]}</div></div></section><section className="grid gap-3 md:grid-cols-3">{state.team.map((member) => { const monster = getMonster(member.id); const selected = member.id === state.activeMonsterId; return <button key={member.id} type="button" disabled={member.hp <= 0 || busy} onClick={() => setBattleState({ ...state, activeMonsterId: member.id })} className={`rounded border-4 p-3 text-left text-[#17251d] ${selected ? "border-[#f7c948] bg-[#fff4c2]" : "border-[#0b1c15] bg-[#f5f0d8]"} disabled:opacity-50`}><div className="flex items-center gap-3"><MonsterSprite monster={monster} selected={member.hp > 0} /><div><h3 className="text-xl font-black">{monster.name}</h3><p className="text-sm font-bold">{member.hp} HP · {selected ? "Active" : "Select"}</p></div></div><p className="mt-2 text-sm font-semibold">{monster.reasoningApproach}</p></button>; })}</section><section className="rounded border-4 border-[#0b1c15] bg-[#f5f0d8] p-4 text-[#17251d]"><div className="flex flex-wrap items-end gap-3"><label className="min-w-56 flex-1 text-sm font-black" htmlFor="partner">Optional helper <select id="partner" className="mt-1 w-full rounded border-2 border-[#0b1c15] bg-white p-2" value={partner} onChange={(event) => setPartner(event.target.value as MonsterId | "")}><option value="">No helper</option>{living.filter((member) => member.id !== state.activeMonsterId).map((member) => <option key={member.id} value={member.id}>{getMonster(member.id).name}</option>)}</select></label><label className="flex items-center gap-2 text-sm font-black"><input type="checkbox" checked={requestResearch} disabled={state.researchUsed || busy} onChange={(event) => setRequestResearch(event.target.checked)} /> Research with Exa {state.researchUsed ? "(used)" : ""}</label></div><label className="mt-3 block text-sm font-black" htmlFor="prompt">Instruction to {active.name}<textarea id="prompt" className="mt-1 min-h-28 w-full rounded border-2 border-[#0b1c15] bg-white p-3 font-semibold" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={`Example: ${active.name}, identify the claim's assumptions, then give a testable qualification.`} /></label><div className="mt-3 flex flex-wrap gap-2"><button className="rounded border-2 border-[#0b1c15] bg-[#f7c948] px-4 py-2 font-black disabled:opacity-50" type="button" disabled={!prompt.trim() || busy} onClick={submitTurn}>{busy ? "Thinking..." : "Send Prompt"}</button>{[`${active.name}, separate the evidence from the conclusion`, `${active.name}, state one condition that would test this claim`].map((example) => <button key={example} className="rounded border-2 border-[#8bd3dd] bg-white px-3 py-2 text-sm font-bold text-[#17414c]" type="button" onClick={() => setPrompt(example)}>{example}</button>)}</div></section>{state.lastResponse ? <section className="rounded border-4 border-[#0b1c15] bg-[#e8ddff] p-4 text-[#17251d]"><h2 className="text-xl font-black">{getMonster(state.activeMonsterId).name}'s response</h2><p className="mt-2 font-semibold">{state.lastResponse.monsterResponse}</p><p className="mt-3 rounded border-2 border-[#6043a4] bg-white p-3 font-bold">{state.lastResponse.argument}</p>{state.lastEvidence.length ? <div className="mt-3 grid gap-2">{state.lastEvidence.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="rounded border-2 border-[#6043a4] bg-white p-2 text-sm font-bold text-[#392465] underline">{source.title} · {source.domain}</a>)}</div> : null}</section> : null}</div><aside className="grid content-start gap-4"><section className="rounded border-4 border-[#0b1c15] bg-[#f5f0d8] p-4 text-[#17251d]"><h2 className="text-xl font-black">Neutral judge</h2>{state.lastEvaluation ? <><p className="mt-2 font-bold">Relevance {state.lastEvaluation.relevance} · Reasoning {state.lastEvaluation.reasoning} · Prompt quality {state.lastEvaluation.promptQuality}</p><p className="mt-3 rounded border-2 border-[#d6b56d] bg-white p-2 text-sm font-semibold">Strength: {state.lastEvaluation.strength}</p><p className="mt-2 rounded border-2 border-[#d6b56d] bg-white p-2 text-sm font-semibold">Improve: {state.lastEvaluation.improvementTip}</p><p className="mt-3 font-black">Performance: {Math.round(scoreFromEvaluation(state.lastEvaluation))}/100</p></> : <p className="mt-2 text-sm font-semibold">Your first prompt will receive neutral feedback on the argument and the instruction.</p>}</section><section className="rounded border-4 border-[#0b1c15] bg-[#f5f0d8] p-4 text-[#17251d]"><h2 className="text-xl font-black">Battle Log</h2><ol className="mt-3 space-y-2">{state.log.map((entry, index) => <li key={`${entry}-${index}`} className="rounded border-2 border-[#d6b56d] bg-white p-2 text-sm font-semibold">{entry}</li>)}</ol></section></aside></div></div></main>;
}

function HpBar({ current, max }: { current: number; max: number }) { return <div className="mt-2 h-4 w-full min-w-32 border-2 border-[#0b1c15] bg-white"><div className="h-full bg-[#58d68d]" style={{ width: `${Math.max(0, Math.round((current / max) * 100))}%` }} /></div>; }
function ResultScreen({ battleState, setBattleState, setScreen }: { battleState: BattleState | null; setBattleState: (state: BattleState | null) => void; setScreen: (screen: AppScreen) => void }) { const victory = battleState?.status === "victory"; function retry() { if (battleState) { const team = battleState.team.map((member) => member.id) as SelectedTeam; setBattleState(createBattleState(team, battleState.scenarioId)); setScreen("battle"); } } return <main className="min-h-screen bg-[#102d1f] p-6 text-white"><section className="mx-auto flex min-h-[80vh] max-w-3xl flex-col justify-center"><p className="text-sm font-black uppercase tracking-wide text-[#f7c948]">Battle Result</p><h1 className="mt-3 font-display text-5xl font-black">{victory ? "Victory" : "Defeat"}</h1><p className="mt-4 text-lg text-[#d9f8df]">{victory ? "Kween's crown now displays a tiny badge reading: context beats confidence." : "Kween is still posing dramatically. Improve the instruction and try again."}</p>{victory ? <div className="mt-6 w-fit rounded border-4 border-[#0b1c15] bg-[#f7c948] px-5 py-3 font-black text-[#102d1f]">Badge earned: Benchmark Buster</div> : null}<div className="mt-8 flex gap-3"><button className="rounded border-2 border-[#f7c948] bg-[#f7c948] px-5 py-3 font-black text-[#102d1f]" type="button" onClick={retry}>Retry</button><button className="rounded border-2 border-[#8bd3dd] bg-[#173f35] px-5 py-3 font-black" type="button" onClick={() => setScreen("meadow")}>Return to Meadow</button></div></section></main>; }
