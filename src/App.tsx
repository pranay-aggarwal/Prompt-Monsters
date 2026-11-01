import { useEffect, useMemo, useState } from "react";
import { ASSETS } from "./shared/assets";
import { battleTurn, createBattleSessionId, type BattleTurnResponse } from "./shared/api";
import { BATTLE_CONFIG } from "./shared/battleConfig";
import { MONSTERS } from "./shared/monsters";
import { KWEEN_SCENARIOS } from "./shared/scenarios";
import type { AppScreen } from "./shared/navigation";
import type { BattleActionId, JudgeEvaluation, MonsterDefinition, MonsterId, MonsterTurnOutput, ProposedMonsterAction, ResearchResult, SelectedTeam } from "./shared/types";

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
  lastActiveMonsterId: MonsterId;
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
  return { team: team.map((id) => ({ id, hp: BATTLE_CONFIG.playerMonsterMaxHp })), scenarioId: scenario.id, activeMonsterId: team[0], kweenHp: BATTLE_CONFIG.kweenMaxHp, kweenShield: BATTLE_CONFIG.kweenStartingShield, turn: 1, patternIndex: 0, log: ["Kween descends with a crown of score tiles.", `Kween: “${scenario.claim}”`, `Practice goal: ${scenario.context}`], decoyActive: false, damageReduction: 0, revealedMove: null, weaknessRevealed: false, bonusDamage: 0, mode: "offline", liveTurnsUsed: 0, researchUsed: false, lastResponse: null, lastActiveMonsterId: team[0], lastEvaluation: null, lastPrompt: "", lastEvidence: [], status: "active" };
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
  const intent = hasWord(text, /\b(analy[sz]e|identify|challenge|check|test|verify|compare|explain|define|protect|predict|reveal|break|heal|argue|assess|evaluate|summari[sz]e|reframe|reason|investigate|research|find|use)\b/);
  if (text.trim().split(/\s+/).length < 4 || !intent) {
    return {
      output: { monsterResponse: `${active.name}: I need a task to work on. Tell me what result you want and give me some context.`, argument: "No argument was submitted; the battle state stays the same.", proposedActions: [], predictedMove: null },
      evaluation: { relevance: 0, reasoning: 0, counterargument: 0, evidence: null, clarity: 0, promptQuality: 0, strength: "You have not given a specific task yet.", improvementTip: `State what ${active.name} should do about Kween's claim.` },
    };
  }
  const actions: ProposedMonsterAction[] = [{ monsterId: active.id, actionId: active.abilityId as BattleActionId }];
  const partner = partnerMonsterId && state.team.some((member) => member.id === partnerMonsterId && member.hp > 0) ? getMonster(partnerMonsterId) : null;
  if (partner && (text.includes(partner.name.toLowerCase()) || text.includes("collaborate") || text.includes("together"))) actions.push({ monsterId: partner.id, actionId: partner.abilityId as BattleActionId });
  const goal = hasWord(text, /\b(identify|challenge|check|test|solve|verify|compare|explain|define|protect|predict|reveal|break|heal)\b/);
  const context = hasWord(text, /\b(kween|claim|benchmark|score|citation|answer|prompt|shield|attack|team)\b/);
  const constraint = hasWord(text, /\b(only|if|when|with|without|before|after|must|specific|condition|then)\b/);
  const evidence = hasWord(text, /\b(evidence|source|research|study|verify|citation|data)\b/);
  const base = (goal ? 25 : 8) + (context ? 25 : 8) + (constraint ? 20 : 8) + (evidence && currentChallenge(state).evidenceRequirement !== "optional" ? 18 : currentChallenge(state).evidenceRequirement === "optional" ? 14 : 5);
  const evaluation: JudgeEvaluation = { relevance: goal && context ? 78 : 42, reasoning: constraint ? 72 : 45, counterargument: hasWord(text, /\b(limit|however|but|assumption|alternative|not always|depends)\b/) ? 78 : 42, evidence: currentChallenge(state).evidenceRequirement === "optional" && !evidence ? null : evidence ? 76 : 30, clarity: instruction.length <= 280 && instruction.trim().split(/\s+/).length >= 3 ? 74 : 42, promptQuality: Math.min(100, base), strength: goal && context ? "The instruction gives the monster a relevant goal and context." : "The instruction points toward an action, but leaves the reasoning task broad.", improvementTip: !goal ? "State the result you want the monster to produce." : !context ? "Name the claim or battle detail the monster should address." : !constraint ? "Add a condition that would let you check whether the answer succeeded." : "Good structure. Keep the conclusion qualified rather than absolute." };
  const predictedMove = actions.some((action) => action.actionId === "giptoo_pattern_echo") ? nextMove(state) : null;
  return { output: { monsterResponse: `${active.name}: ${active.voiceStyle} I will address Kween's claim using my ${active.reasoningApproach.toLowerCase()} ${partner ? `With ${partner.name}, I will combine our approaches.` : ""}`, argument: `Offline practice argument: the claim needs a clear test and relevant context. ${instruction}`, proposedActions: actions, predictedMove }, evaluation };
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
  if (move === "royal_strike") next.damageReduction = 0; next.revealedMove = null; next.patternIndex += 1; next.turn += 1; return next;
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

function TitleScreen({ onStart }: { onStart: () => void }) { return <main className="title-screen"><section className="title-copy"><span className="title-label">A prompt-driven pixel RPG</span><h1>Prompt<br />Monsters</h1><p>They have billions of parameters. You have one good prompt.</p><button className="title-start" type="button" onClick={onStart}>Start new session</button><div className="title-world-preview" aria-label="Meet your monster partners">{MONSTERS.slice(0, 3).map((monster) => <MonsterSprite key={monster.id} monster={monster} />)}</div></section></main>; }

function MeadowScreen({ player, direction, dialogueOpen, dialogueIndex, notice, interactionTarget, onCloseDialogue, onNextDialogue, onCollection }: { player: Position; direction: Direction; dialogueOpen: boolean; dialogueIndex: number; notice: string; interactionTarget: string | null; onCloseDialogue: () => void; onNextDialogue: () => void; onCollection: () => void }) {
  return <main className="meadow-screen"><div className="meadow-shell"><header className="meadow-header"><div><p className="eyebrow">Prompt Meadow · Field route 01</p><h1>Small world, big ideas</h1></div><button className="primary-button" type="button" onClick={onCollection}>Monster collection</button></header><div className="meadow-layout"><div className="meadow-map-frame"><div className="meadow-grid" role="img" aria-label="Prompt Meadow map. Move with WASD or arrow keys and interact near objects." style={{ gridTemplateColumns: `repeat(${meadowWidth}, ${tileSize}px)`, gridTemplateRows: `repeat(${meadowHeight}, ${tileSize}px)` }}>{Array.from({ length: meadowWidth * meadowHeight }, (_, index) => { const position = { x: index % meadowWidth, y: Math.floor(index / meadowWidth) }; const tile = getTile(position); const isPlayer = samePosition(position, player); return <div key={keyOf(position)} className={`meadow-tile meadow-tile-${tile} ${isPlayer ? "meadow-player" : ""}`}>{isPlayer ? <SpriteSlot src={ASSETS.player[direction]} alt="Player character" className="player-sprite" fallback={direction === "left" ? "<" : direction === "right" ? ">" : direction === "up" ? "^" : "v"} /> : <span>{tileLabel(tile)}</span>}</div>; })}</div></div><aside className="meadow-side"><section className="meadow-guide"><div className="guide-portrait"><SpriteSlot src={ASSETS.guide} alt="Meadow guide sprite" className="guide-sprite" fallback="?" /><div><p className="eyebrow">Meadow guide</p><h2>Prompt practice starts here</h2></div></div><p>{dialogueOpen ? npcLines[dialogueIndex] : "Find the guide, read the signs, and visit the shrine to choose your team."}</p>{dialogueOpen ? <div className="result-actions"><button className="primary-button" type="button" onClick={onNextDialogue}>Next line</button><button className="secondary-button" type="button" onClick={onCloseDialogue}>Close</button></div> : null}<p className="interaction-banner">{interactionTarget ? `Press E or Enter to interact with ${interactionTarget}.` : notice}</p></section><section className="meadow-controls"><h2>Controls</h2><div className="control-keys" aria-label="Movement keys"><span>W</span><span>A</span><span>S</span><span>D</span></div><p>Move with WASD or arrow keys. Press E or Enter near the guide, shrine, sign, or Kween gate.</p></section></aside></div></div></main>;
}

function SpriteSlot({ src, alt, className, fallback }: { src: string; alt: string; className: string; fallback: string }) {
  const [missing, setMissing] = useState(false);
  return <div className={`sprite-slot ${className} ${missing ? "sprite-slot-fallback" : "sprite-slot-loaded"}`} aria-label={alt}>
    {missing ? <span className="monster-face">{fallback}</span> : <img src={src} alt={alt} onError={() => setMissing(true)} />}
  </div>;
}
function MonsterSprite({ monster, selected = false }: { monster: MonsterDefinition; selected?: boolean }) { const fallback = monster.id === "coddy" ? "</>" : monster.id === "giptoo" ? "2" : monster.id === "astra" ? "*" : monster.id === "sori" ? "~" : ")"; return <SpriteSlot src={monster.sprite} alt={`${monster.name} sprite`} className={`monster-sprite monster-sprite-${monster.id} ${selected ? "monster-sprite-selected" : ""}`} fallback={fallback} />; }
function CollectionScreen({ selected, setSelected, scenarioId, setScenarioId, onBack, onStart }: { selected: MonsterId[]; setSelected: (ids: MonsterId[]) => void; scenarioId: string; setScenarioId: (id: string) => void; onBack: () => void; onStart: (team: SelectedTeam) => void }) {
  function toggle(id: MonsterId) { setSelected(selected.includes(id) ? selected.filter((value) => value !== id) : selected.length < 3 ? [...selected, id] : selected); }
  const selectedNames = selected.map((id) => getMonster(id).name).join(" · ");
  return <main className="collection-screen"><div className="collection-shell"><header className="collection-header"><div><p className="eyebrow">Collection Shrine · Five partners found</p><h1>Build your thinking team</h1></div><button className="secondary-button" type="button" onClick={onBack}>Return to Meadow</button></header><p className="collection-intro">Choose three pets with different ways to reason. You can switch the active pet during the battle.</p><div className="collection-grid">{MONSTERS.map((monster) => { const isSelected = selected.includes(monster.id); return <button key={monster.id} className={`monster-card ${isSelected ? "is-selected" : ""}`} type="button" aria-pressed={isSelected} onClick={() => toggle(monster.id)}><span className="selected-check" aria-hidden="true">{isSelected ? "✓" : "+"}</span><div className="monster-card-top"><MonsterSprite monster={monster} selected={isSelected} /><div><h2>{monster.name}</h2><p>{monster.personality}</p></div></div><p className="monster-copy">{monster.reasoningApproach}</p><p className="monster-ability">{monster.abilityName} · {monster.abilityDescription}</p></button>; })}</div><footer className="collection-footer"><div className="team-count"><strong>{selected.length} / 3 chosen</strong><span>{selectedNames || "Select a trio to continue"}</span></div><div className="scenario-choice"><label htmlFor="scenario">Choose Kween's challenge</label><select id="scenario" value={scenarioId} onChange={(event) => setScenarioId(event.target.value)}>{KWEEN_SCENARIOS.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.claim}</option>)}</select></div><button className="primary-button" type="button" disabled={selected.length !== 3} onClick={() => onStart(selected as SelectedTeam)}>Enter Kween battle</button></footer><p className="synergy-guide"><strong>Team pairings:</strong> Astra + Coddy break extra shield · Giptoo + Sori can turn a correct prediction into a blocked strike · Soli heals an extra 5 HP when helping a teammate.</p></div></main>;
}

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
    const namesHelper = partner && prompt.toLowerCase().includes(getMonster(partner).name.toLowerCase());
    const input = { battleId, scenarioId: state.scenarioId, instruction: prompt.trim(), activeMonsterId: state.activeMonsterId, ...(namesHelper && partner ? { partnerMonsterId: partner } : {}), selectedMonsterIds: team, requestResearch, battleContext: { turn: state.turn, kweenHp: state.kweenHp, kweenShield: state.kweenShield, nextBossMove: kweenMoveNames[nextMove(state)] } };
    const result: BattleTurnResponse = await battleTurn(input);
    let output: MonsterTurnOutput;
    let evaluation: JudgeEvaluation;
    let mode: "live" | "offline" = "offline";
    let evidence: ResearchResult[] = [];
    let notice = "";
    if (result.ok) { output = result; evaluation = result.evaluation; mode = "live"; evidence = result.researchResults; notice = result.researchNotice ?? ""; }
    else { const fallback = offlineTurn(state, prompt.trim(), namesHelper ? partner : undefined); output = fallback.output; evaluation = fallback.evaluation; notice = `${result.error} Offline Practice Mode used.`; }
    const validActions = output.proposedActions.filter((action, index) => { const member = state.team.find((value) => value.id === action.monsterId); const expected = getMonster(action.monsterId).abilityId; return index < 2 && member?.hp && member.hp > 0 && action.actionId === expected && (action.monsterId === state.activeMonsterId || (namesHelper && action.monsterId === partner)); });
    if (!validActions.some((action) => action.monsterId === state.activeMonsterId)) { const noAction = addLog(state, output.argument.startsWith("No argument") ? `${output.monsterResponse} Try: “${active.name}, analyze Kween's claim and give one testable reason.”` : "The response did not include a legal action for the active monster. No battle state changed."); setBattleState(noAction); setBusy(false); return; }
    const next: BattleState = { ...state, team: state.team.map((member) => ({ ...member })), log: [...state.log, `You → ${active.name}: “${prompt.trim()}”`, `${mode === "live" ? "Live AI" : "Offline Practice Mode"}: ${output.monsterResponse}`, `Argument: ${output.argument}`, notice].filter(Boolean), mode, liveTurnsUsed: state.liveTurnsUsed + (mode === "live" ? 1 : 0), researchUsed: state.researchUsed || requestResearch, lastResponse: output, lastActiveMonsterId: state.activeMonsterId, lastEvaluation: evaluation, lastPrompt: prompt.trim(), lastEvidence: evidence };
    const score = scoreFromEvaluation(evaluation);
    const baseDamage = damageForScore(score) + next.bonusDamage;
    next.bonusDamage = 0;
    const shieldBefore = next.kweenShield;
    next.kweenShield = Math.max(0, next.kweenShield - baseDamage);
    next.kweenHp = Math.max(0, next.kweenHp - Math.max(0, baseDamage - shieldBefore));
    next.log.push(`Judge score ${Math.round(score)}/100. The argument deals ${baseDamage} impact.`);
    const predictionCorrect = output.predictedMove !== null && output.predictedMove === nextMove(next);
    for (const action of validActions) applyAbility(next, action, predictionCorrect);
    const actionIds = new Set(validActions.map((action) => action.actionId));
    if (actionIds.has("astra_galaxy_brain") && actionIds.has("coddy_patch_pounce")) { const extra = Math.min(BATTLE_CONFIG.abilityValues.astraCoddyShieldBonus, next.kweenShield); next.kweenShield -= extra; next.log.push(`Weakness Exploit removes an extra ${extra} shield.`); }
    if (actionIds.has("giptoo_pattern_echo") && actionIds.has("sori_scene_shift") && predictionCorrect) { next.decoyActive = true; next.log.push("Misdirection is ready: Sori's decoy will absorb Royal Strike."); }
    if (partner === "soli" && validActions.some((action) => action.monsterId === "soli") && state.activeMonsterId !== "soli") { const target = mostInjured(next.team); if (target) { const healed = Math.min(BATTLE_CONFIG.abilityValues.soliAssistHeal, BATTLE_CONFIG.playerMonsterMaxHp - target.hp); target.hp += healed; next.log.push(`Echo Assist restores ${healed} HP to ${getMonster(target.id).name}.`); } }
    let completed = updateStatus(next);
    if (completed.status === "active") completed = updateStatus(applyKween(completed));
    setBattleState(completed); setPrompt(""); setPartner(""); setRequestResearch(false); setBusy(false);
    if (completed.status !== "active") setScreen("result");
  }
  return <main className="game-screen battle-screen min-h-screen bg-[#18122b] p-4 text-white"><div className="game-shell mx-auto max-w-7xl"><header className="game-topbar flex flex-wrap items-end justify-between gap-3 border-b-4 border-[#5b4b8a] pb-4"><div><p className="eyebrow">Kween Arena <span className={`mode-pill ${state.mode}`}>{state.mode === "live" ? "Live AI" : "Offline Practice"}</span></p><h1 className="font-display text-4xl font-black">Read. Prompt. Improve.</h1></div><button className="secondary-button" type="button" onClick={() => setScreen("collection")}>Change Team</button></header><div className="battle-layout mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_23rem]"><div className="battle-main grid gap-4"><section className="claim-panel"><div className="claim-art"><SpriteSlot src={ASSETS.kween} alt="Kween sprite" className="kween-sprite" fallback="K" /></div><div className="claim-copy"><p className="eyebrow">Kween's claim <span className="difficulty-pill">{scenario.difficulty}</span></p><h2>“{scenario.claim}”</h2><p>{scenario.context}</p><p className="prompt-objective">A strong answer can challenge or qualify the claim. Explain why, then give a condition someone could use to check it.</p></div><div className="boss-vitals"><div><span>HP</span><strong>{state.kweenHp}<small>/{BATTLE_CONFIG.kweenMaxHp}</small></strong><HpBar current={state.kweenHp} max={BATTLE_CONFIG.kweenMaxHp} /></div><div><span>SHIELD</span><strong>{state.kweenShield}<small>/{BATTLE_CONFIG.kweenMaxShield}</small></strong><HpBar current={state.kweenShield} max={BATTLE_CONFIG.kweenMaxShield} /></div><div className="next-move"><span>UP NEXT</span><strong>{state.revealedMove ? kweenMoveNames[state.revealedMove] : kweenMoveNames[nextMove(state)]}</strong></div></div></section><section className="team-strip" aria-label="Selected team">{state.team.map((member) => { const monster = getMonster(member.id); const selected = member.id === state.activeMonsterId; return <button key={member.id} type="button" disabled={member.hp <= 0 || busy} onClick={() => setBattleState({ ...state, activeMonsterId: member.id })} className={`team-member ${selected ? "is-active" : ""} ${member.hp <= 0 ? "is-defeated" : ""}`}><MonsterSprite monster={monster} selected={selected} /><span className="team-member-info"><strong>{monster.name}</strong><span>{member.hp} / {BATTLE_CONFIG.playerMonsterMaxHp} HP</span><span className="team-role">{monster.abilityName}</span><HpBar current={member.hp} max={BATTLE_CONFIG.playerMonsterMaxHp} /></span><span className="active-tag">{selected ? "ACTIVE" : "SELECT"}</span></button>; })}</section><section className="prompt-workbench"><div className="workbench-heading"><div><p className="eyebrow">Your turn · {state.turn}</p><h2>Give {active.name} an instruction</h2></div><span className="ability-token">{active.abilityName}</span></div><p className="active-reasoning">{active.reasoningApproach}</p><div className="prompt-options"><label htmlFor="partner">TEAM HELPER <select id="partner" value={partner} disabled={busy} onChange={(event) => setPartner(event.target.value as MonsterId | "")}><option value="">No helper</option>{living.filter((member) => member.id !== state.activeMonsterId).map((member) => <option key={member.id} value={member.id}>{getMonster(member.id).name}</option>)}</select></label><label className={`research-toggle ${state.researchUsed ? "is-used" : ""}`}><input type="checkbox" checked={requestResearch} disabled={state.researchUsed || busy} onChange={(event) => setRequestResearch(event.target.checked)} /><span><strong>{state.researchUsed ? "Research used" : "Request research"}</strong><small>Uses the encounter's one Exa search</small></span></label></div>{partner ? <p className="helper-hint">To collaborate, include {getMonster(partner).name}'s name in your instruction.</p> : null}<label className="prompt-label" htmlFor="prompt">INSTRUCTION<textarea id="prompt" maxLength={3000} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={`Example: ${active.name}, examine Kween's claim. Separate what the benchmark shows from what it cannot prove, and suggest a fair test.`} /></label><div className="prompt-footer"><span>{prompt.length}/3000 · Be specific about the goal, context, and how to check the answer.</span><button className="primary-button" type="button" disabled={!prompt.trim() || busy || state.status !== "active"} onClick={submitTurn}>{busy ? "Thinking..." : "Send instruction"}</button></div><div className="prompt-examples"><span>TRY:</span>{[`${active.name}, identify one assumption in the claim and test it`, `${active.name}, explain when this claim could be true and where it fails`].map((example) => <button key={example} type="button" onClick={() => setPrompt(example)}>{example}</button>)}</div></section>{state.lastResponse ? <section className="response-panel"><div className="response-heading"><MonsterSprite monster={getMonster(state.lastActiveMonsterId)} /><div><p className="eyebrow">{state.mode === "live" ? "MONSTER RESPONSE" : "OFFLINE PRACTICE RESPONSE"}</p><h2>{getMonster(state.lastActiveMonsterId).name} answers</h2></div></div><blockquote>{state.lastResponse.monsterResponse}</blockquote><div className="argument-box"><span>THE ARGUMENT</span><p>{state.lastResponse.argument}</p></div><div className="submitted-prompt"><span>YOUR PROMPT</span><p>{state.lastPrompt}</p></div>{state.lastEvidence.length ? <div className="evidence-list"><h3>Research sources</h3>{state.lastEvidence.slice(0, 3).map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer"><strong>{source.title}</strong><span>{source.domain}{source.publishedDate ? ` · ${source.publishedDate}` : ""}</span>{source.excerpt ? <small>{source.excerpt}</small> : null}</a>)}</div> : null}</section> : null}</div><aside className="battle-sidebar"><section className="judge-panel"><p className="eyebrow">TURN REVIEW</p><h2>Neutral judge</h2>{state.lastEvaluation ? <><div className="score-summary"><strong>{Math.round(scoreFromEvaluation(state.lastEvaluation))}</strong><span>/ 100<br />impact score</span></div><div className="judge-scores"><span>Relevance <b>{state.lastEvaluation.relevance}</b></span><span>Reasoning <b>{state.lastEvaluation.reasoning}</b></span><span>Counterargument <b>{state.lastEvaluation.counterargument}</b></span>{state.lastEvaluation.evidence !== null ? <span>Evidence <b>{state.lastEvaluation.evidence}</b></span> : null}<span>Clarity <b>{state.lastEvaluation.clarity}</b></span><span>Prompt quality <b>{state.lastEvaluation.promptQuality}</b></span></div><div className="feedback-note"><strong>What worked</strong><p>{state.lastEvaluation.strength}</p></div><div className="feedback-note improvement"><strong>Try next</strong><p>{state.lastEvaluation.improvementTip}</p></div></> : <p className="judge-empty">Your prompt and argument receive separate feedback. Improve one thing at a time and see how the battle changes.</p>}<p className="offline-note">Offline scores are provisional practice feedback. Live AI judging needs the configured AI provider on the server. Research needs Exa access.</p></section><section className="battle-log"><div className="log-heading"><h2>Battle log</h2><span>TURN {state.turn}</span></div><ol>{state.log.map((entry, index) => <li key={`${entry}-${index}`}>{entry}</li>)}</ol></section></aside></div></div></main>;
}

function HpBar({ current, max }: { current: number; max: number }) { const percent = Math.max(0, Math.round((current / max) * 100)); return <div className={`hp-bar ${max === BATTLE_CONFIG.kweenMaxShield ? "is-shield" : ""}`} role="progressbar" aria-valuenow={current} aria-valuemin={0} aria-valuemax={max}><div style={{ width: `${percent}%` }} /></div>; }
function ResultScreen({ battleState, setBattleState, setScreen }: { battleState: BattleState | null; setBattleState: (state: BattleState | null) => void; setScreen: (screen: AppScreen) => void }) { const victory = battleState?.status === "victory"; function retry() { if (battleState) { const team = battleState.team.map((member) => member.id) as SelectedTeam; setBattleState(createBattleState(team, battleState.scenarioId)); setScreen("battle"); } } return <main className="result-screen"><section className="result-card"><p className="eyebrow">Kween Arena · Battle result</p><h1>{victory ? "Victory!" : "Try again"}</h1><p>{victory ? "Kween's crown now displays a tiny badge reading: context beats confidence." : "Kween is still posing dramatically. Take the judge's feedback into your next prompt."}</p>{victory ? <span className="result-badge">Badge earned · Benchmark Buster</span> : null}<div className="result-actions"><button className="primary-button" type="button" onClick={retry}>{victory ? "Play again" : "Retry battle"}</button><button className="secondary-button" type="button" onClick={() => setScreen("meadow")}>Return to Meadow</button></div></section></main>; }
