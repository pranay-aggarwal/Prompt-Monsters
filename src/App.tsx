import { useEffect, useMemo, useState } from "react";
import { BATTLE_CONFIG } from "./shared/battleConfig";
import { createBattleSessionId, interpretBattle, searchEvidence } from "./shared/api";
import { MONSTERS } from "./shared/monsters";
import { type AppScreen } from "./shared/navigation";
import type { BattleActionId, EvaluatorSuggestion, MonsterDefinition, MonsterId, ResearchResult, SelectedTeam, SuggestedMonsterAction } from "./shared/types";

type Position = {
  x: number;
  y: number;
};

type Direction = "down" | "left" | "right" | "up";
type Tile = "grass" | "path" | "flower" | "tree" | "pond" | "rock" | "portal" | "sign" | "npc";
type KweenMoveId = (typeof BATTLE_CONFIG.kweenPattern)[number];
type KweenChallenge = {
  title: string;
  claim: string;
  task: string;
  skill: string;
};

type BattleMonsterState = {
  id: MonsterId;
  hp: number;
};

type BattleState = {
  team: BattleMonsterState[];
  kweenHp: number;
  kweenShield: number;
  turn: number;
  patternIndex: number;
  log: string[];
  decoyActive: boolean;
  damageReduction: number;
  revealedMove: KweenMoveId | null;
  weaknessRevealed: boolean;
  status: "active" | "victory" | "defeat";
};

const tileSize = 34;
const meadowWidth = 16;
const meadowHeight = 11;
const startPosition: Position = { x: 2, y: 8 };

const npcPosition: Position = { x: 4, y: 6 };
const signPosition: Position = { x: 11, y: 7 };
const collectionPosition: Position = { x: 2, y: 2 };
const portalPosition: Position = { x: 13, y: 5 };

const obstacles = new Set([
  "0,0",
  "1,0",
  "2,0",
  "3,0",
  "4,0",
  "5,0",
  "6,0",
  "7,0",
  "8,0",
  "9,0",
  "10,0",
  "11,0",
  "12,0",
  "13,0",
  "14,0",
  "15,0",
  "0,1",
  "15,1",
  "0,2",
  "5,2",
  "6,2",
  "12,2",
  "15,2",
  "0,3",
  "12,3",
  "15,3",
  "0,4",
  "3,4",
  "9,4",
  "10,4",
  "15,4",
  "0,5",
  "3,5",
  "9,5",
  "10,5",
  "15,5",
  "0,6",
  "15,6",
  "0,7",
  "6,7",
  "15,7",
  "0,8",
  "6,8",
  "15,8",
  "0,9",
  "15,9",
  "0,10",
  "1,10",
  "2,10",
  "3,10",
  "4,10",
  "5,10",
  "6,10",
  "7,10",
  "8,10",
  "9,10",
  "10,10",
  "11,10",
  "12,10",
  "13,10",
  "14,10",
  "15,10",
]);

const terrain = new Map<string, Tile>([
  ["2,2", "sign"],
  ["4,6", "npc"],
  ["11,7", "sign"],
  ["13,5", "portal"],
  ["7,1", "flower"],
  ["8,1", "flower"],
  ["2,3", "flower"],
  ["5,8", "flower"],
  ["12,8", "flower"],
  ["9,4", "pond"],
  ["10,4", "pond"],
  ["9,5", "pond"],
  ["10,5", "pond"],
  ["5,2", "tree"],
  ["6,2", "tree"],
  ["12,2", "tree"],
  ["3,4", "rock"],
  ["3,5", "rock"],
  ["6,7", "tree"],
  ["6,8", "tree"],
]);

const npcLines = [
  "Welcome to Prompt Meadow.",
  "The meadow's five little partners love clear instructions.",
  "Open the collection shrine, choose three, then test your strategy at Kween's gate.",
];

const kweenMoveNames: Record<KweenMoveId, string> = {
  benchmark_brag: "Benchmark Brag",
  score_surge: "Score Surge",
  royal_strike: "Royal Strike",
};

const kweenChallenges: KweenChallenge[] = [
  {
    title: "Challenge the claim",
    claim: "My benchmark score proves I am the most intelligent system in existence.",
    task: "Ask for a specific weakness in that claim, then use evidence or a clear test to challenge it.",
    skill: "Goal + evidence",
  },
  {
    title: "Define success",
    claim: "I optimized one score, so every answer I give must be correct.",
    task: "Give one objective, one relevant context, and a condition that would prove the answer is good enough.",
    skill: "Context + constraints",
  },
  {
    title: "Protect the team",
    claim: "Your vague instruction lets me choose the target and the rules.",
    task: "Name the result you want and what should happen if Kween attacks before the task is complete.",
    skill: "Clear instruction",
  },
];

function keyOf(position: Position) {
  return `${position.x},${position.y}`;
}

function isSamePosition(a: Position, b: Position) {
  return a.x === b.x && a.y === b.y;
}

function isAdjacent(a: Position, b: Position) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

function getFacingPosition(position: Position, direction: Direction): Position {
  if (direction === "up") return { x: position.x, y: position.y - 1 };
  if (direction === "down") return { x: position.x, y: position.y + 1 };
  if (direction === "left") return { x: position.x - 1, y: position.y };
  return { x: position.x + 1, y: position.y };
}

function getTile(position: Position): Tile {
  const terrainTile = terrain.get(keyOf(position));

  if (terrainTile) {
    return terrainTile;
  }

  if ((position.y === 8 && position.x > 1 && position.x < 14) || (position.x === 7 && position.y > 1 && position.y < 9)) {
    return "path";
  }

  return "grass";
}

function isBlocked(position: Position) {
  return (
    position.x < 0 ||
    position.y < 0 ||
    position.x >= meadowWidth ||
    position.y >= meadowHeight ||
    obstacles.has(keyOf(position)) ||
    isSamePosition(position, npcPosition)
  );
}

function getInteraction(position: Position, direction: Direction) {
  const facing = getFacingPosition(position, direction);

  if (isAdjacent(position, npcPosition) || isSamePosition(facing, npcPosition)) return "npc";
  if (isSamePosition(position, collectionPosition) || isSamePosition(facing, collectionPosition)) return "collection";
  if (isSamePosition(position, portalPosition) || isSamePosition(facing, portalPosition)) return "battle";
  if (isSamePosition(facing, signPosition)) return "sign";

  return null;
}

function tileLabel(tile: Tile) {
  const labels: Record<Tile, string> = {
    grass: "",
    path: "",
    flower: "*",
    tree: "T",
    pond: "~",
    rock: "o",
    portal: "K",
    sign: "!",
    npc: "?",
  };

  return labels[tile];
}

function getMonster(id: MonsterId) {
  return MONSTERS.find((monster) => monster.id === id)!;
}

function createBattleState(team: SelectedTeam): BattleState {
  return {
    team: team.map((id) => ({ id, hp: BATTLE_CONFIG.playerMonsterMaxHp })),
    kweenHp: BATTLE_CONFIG.kweenMaxHp,
    kweenShield: BATTLE_CONFIG.kweenStartingShield,
    turn: 1,
    patternIndex: 0,
    log: [
      "Kween descends with a crown of benchmark tiles.",
      "Kween: My score proves I am the most intelligent system in existence.",
      `Problem 1: ${kweenChallenges[0].task}`,
    ],
    decoyActive: false,
    damageReduction: 0,
    revealedMove: null,
    weaknessRevealed: false,
    status: "active",
  };
}

function getCurrentChallenge(state: BattleState): KweenChallenge {
  return kweenChallenges[(state.turn - 1) % kweenChallenges.length];
}

function getNextKweenMove(state: BattleState) {
  return BATTLE_CONFIG.kweenPattern[state.patternIndex % BATTLE_CONFIG.kweenPattern.length];
}

function getMostInjuredLiving(team: BattleMonsterState[]) {
  return team.filter((monster) => monster.hp > 0).sort((a, b) => a.hp - b.hp)[0] ?? null;
}

function getFirstLiving(team: BattleMonsterState[]) {
  return team.find((monster) => monster.hp > 0) ?? null;
}

function applyPlayerAction(state: BattleState, action: SuggestedMonsterAction) {
  const actor = state.team.find((monster) => monster.id === action.monsterId);
  const next: BattleState = {
    ...state,
    team: state.team.map((monster) => ({ ...monster })),
    log: [...state.log],
  };

  if (!actor || actor.hp <= 0) {
    next.log.push("That action fizzles because the chosen monster is not able to act.");
    return next;
  }

  const actorName = getMonster(action.monsterId).name;

  if (action.actionId === "basic_attack") {
    const shieldDamage = Math.min(5, next.kweenShield);
    const hpDamage = shieldDamage > 0 ? 0 : 5;
    next.kweenShield -= shieldDamage;
    next.kweenHp = Math.max(0, next.kweenHp - hpDamage);
    next.log.push(`${actorName} makes a careful basic attack for ${shieldDamage || hpDamage} ${shieldDamage ? "shield" : "HP"} damage.`);
    return next;
  }

  if (action.actionId === "soli_echo_cheer") {
    const target = getMostInjuredLiving(next.team);
    if (!target) return next;
    const healed = Math.min(BATTLE_CONFIG.abilityValues.soliHeal, BATTLE_CONFIG.playerMonsterMaxHp - target.hp);
    target.hp += healed;
    next.log.push(`Soli uses Echo Cheer. ${getMonster(target.id).name} recovers ${healed} HP.`);
    return next;
  }

  if (action.actionId === "astra_galaxy_brain") {
    next.revealedMove = getNextKweenMove(next);
    next.weaknessRevealed = true;
    next.log.push(`Astra uses Galaxy Brain. Next move: ${kweenMoveNames[next.revealedMove]}. Kween's shield is the current weakness.`);
    return next;
  }

  if (action.actionId === "giptoo_pattern_echo") {
    const prediction = getNextKweenMove(next);
    if (prediction === "royal_strike") {
      next.damageReduction = BATTLE_CONFIG.abilityValues.giptooDamageReduction;
      next.log.push("Giptoo uses Pattern Echo and predicts Royal Strike. The next hit will be softened.");
    } else {
      next.log.push(`Giptoo predicts ${kweenMoveNames[prediction]}, which is technically correct but mostly makes a cheerful beep.`);
    }
    return next;
  }

  if (action.actionId === "sori_scene_shift") {
    next.decoyActive = true;
    next.log.push("Sori uses Scene Shift. A soft cinematic decoy hops into place.");
    return next;
  }

  if (action.actionId === "coddy_patch_pounce") {
    if (next.kweenShield > 0) {
      const removed = Math.min(BATTLE_CONFIG.abilityValues.coddyShieldRemoval, next.kweenShield);
      next.kweenShield -= removed;
      next.log.push(`Coddy uses Patch Pounce and removes ${removed} shield.`);
    } else {
      next.kweenHp = Math.max(0, next.kweenHp - BATTLE_CONFIG.abilityValues.coddyDirectDamage);
      next.log.push(`Coddy exploits the exposed weakness for ${BATTLE_CONFIG.abilityValues.coddyDirectDamage} HP damage.`);
    }
    return next;
  }

  next.log.push("The instruction does not map to a valid battle action.");
  return next;
}

function applyKweenResponse(state: BattleState) {
  const next: BattleState = {
    ...state,
    team: state.team.map((monster) => ({ ...monster })),
    log: [...state.log],
  };
  const move = getNextKweenMove(next);

  if (move === "benchmark_brag") {
    next.kweenShield = Math.min(BATTLE_CONFIG.kweenMaxShield, next.kweenShield + BATTLE_CONFIG.abilityValues.kweenShieldGain);
    next.log.push("Kween uses Benchmark Brag and rebuilds 5 shield.");
  } else if (move === "score_surge") {
    next.kweenShield = Math.min(BATTLE_CONFIG.kweenMaxShield, next.kweenShield + BATTLE_CONFIG.abilityValues.kweenShieldGain);
    next.log.push("Kween uses Score Surge. More defensive tiles orbit the crown.");
  } else {
    if (next.decoyActive) {
      next.decoyActive = false;
      next.log.push("Kween uses Royal Strike, but Sori's decoy absorbs it completely.");
    } else {
      const target = getFirstLiving(next.team);
      if (target) {
        const damage = Math.max(0, BATTLE_CONFIG.abilityValues.kweenRoyalStrikeDamage - next.damageReduction);
        target.hp = Math.max(0, target.hp - damage);
        next.log.push(`Kween uses Royal Strike. ${getMonster(target.id).name} takes ${damage} damage.`);
      }
    }
  }

  next.damageReduction = 0;
  next.revealedMove = null;
  next.patternIndex += 1;
  next.turn += 1;
  const challenge = getCurrentChallenge(next);
  next.log.push(`New problem: ${challenge.title}. ${challenge.task}`);
  return updateBattleStatus(next);
}

function updateBattleStatus(state: BattleState) {
  const next = { ...state, log: [...state.log] };
  if (next.kweenHp <= 0) {
    next.status = "victory";
    next.log.push("Kween's benchmark crown pops loose. Victory!");
  } else if (next.team.every((monster) => monster.hp <= 0)) {
    next.status = "defeat";
    next.log.push("The team is out of HP. Kween keeps bragging. Retry?");
  }
  next.log = next.log.slice(-8);
  return next;
}

function validateSuggestion(state: BattleState, suggestion: EvaluatorSuggestion): EvaluatorSuggestion {
  const validActions = suggestion.actions.filter((action) => {
    const actor = state.team.find((monster) => monster.id === action.monsterId);
    return Boolean(actor && actor.hp > 0 && action.actionId !== "invalid_action");
  });

  if (validActions.length === 0) {
    return {
      actions: [],
      explanation: "Name a selected living monster and a clear action, such as Coddy break shield or Sori make a decoy.",
    };
  }

  return { ...suggestion, actions: validActions.slice(0, 2) };
}

function evaluatePrompt(instruction: string, team: BattleMonsterState[], shield: number, challenge: KweenChallenge): EvaluatorSuggestion {
  const text = instruction.toLowerCase();
  const actions: SuggestedMonsterAction[] = [];

  const hasGoal = /\b(identify|challenge|check|prove|test|break|reveal|protect|heal|predict|block|compare|solve)\b/.test(text);
  const hasContext = /\b(kween|benchmark|score|claim|shield|strike|attack|team|weakness|target)\b/.test(text);
  const hasConstraint = /\b(then|only|if|when|with|without|before|after|must|should|condition|specific|clear)\b/.test(text);
  const usesEvidence = /\b(evidence|source|study|research|benchmark|score|data)\b/.test(text);

  function promptCoaching() {
    const missing: string[] = [];
    if (!hasGoal) missing.push("a clear goal");
    if (!hasContext) missing.push("relevant context about Kween");
    if (!hasConstraint) missing.push("a condition or constraint");
    if (challenge.skill === "Goal + evidence" && !usesEvidence) missing.push("evidence or a testable check");
    return missing.length ? ` To strengthen it, add ${missing.join(", ")}.` : " Strong prompt structure: it states the goal, context, and a way to check the result.";
  }

  function add(monsterId: MonsterId, actionId: BattleActionId) {
    if (team.some((monster) => monster.id === monsterId) && !actions.some((action) => action.monsterId === monsterId)) {
      actions.push({ monsterId, actionId });
    }
  }

  if (text.includes("soli") || text.includes("heal") || text.includes("cheer")) add("soli", "soli_echo_cheer");
  if (text.includes("astra") || text.includes("reveal") || text.includes("weakness") || text.includes("next move")) add("astra", "astra_galaxy_brain");
  if (text.includes("giptoo") || text.includes("predict") || text.includes("pattern")) add("giptoo", "giptoo_pattern_echo");
  if (text.includes("sori") || text.includes("decoy") || text.includes("illusion") || text.includes("scene")) add("sori", "sori_scene_shift");
  if (text.includes("coddy") || text.includes("shield") || text.includes("patch") || text.includes("break")) add("coddy", "coddy_patch_pounce");

  if (actions.length === 0 && (text.includes("attack") || text.includes("hit"))) {
    const actor = team.find((monster) => monster.hp > 0);
    if (actor) actions.push({ monsterId: actor.id, actionId: "basic_attack" });
  }

  if (actions.length === 0) {
    return {
      actions: [],
      explanation: `Kween needs an executable instruction from a selected monster.${promptCoaching()} Try: “Astra identify the benchmark claim with evidence, then Coddy break the shield.”`,
    };
  }

  const explanation =
    actions.length > 1
      ? `Clear combo detected. ${promptCoaching()}`
      : shield > 0
        ? `Clear action detected. Kween still has shield, so shield control matters.${promptCoaching()}`
        : `Clear action detected. Kween's HP is exposed.${promptCoaching()}`;

  return { actions: actions.slice(0, 2), explanation };
}

export function App() {
  const [screen, setScreen] = useState<AppScreen>("title");
  const [selectedMonsters, setSelectedMonsters] = useState<MonsterId[]>([]);
  const [battleTeam, setBattleTeam] = useState<SelectedTeam | null>(null);
  const [battleState, setBattleState] = useState<BattleState | null>(null);
  const [player, setPlayer] = useState<Position>(startPosition);
  const [direction, setDirection] = useState<Direction>("down");
  const [dialogueOpen, setDialogueOpen] = useState(false);
  const [dialogueIndex, setDialogueIndex] = useState(0);
  const [notice, setNotice] = useState("Arrow keys or WASD to move. Press E or Enter to interact.");

  const interaction = useMemo(() => getInteraction(player, direction), [player, direction]);

  useEffect(() => {
    if (screen !== "meadow") {
      return undefined;
    }

    function move(nextDirection: Direction) {
      setDirection(nextDirection);
      setDialogueOpen(false);
      setDialogueIndex(0);
      setPlayer((current) => {
        const next = getFacingPosition(current, nextDirection);
        if (isBlocked(next)) {
          setNotice("That way is blocked.");
          return current;
        }
        setNotice("Arrow keys or WASD to move. Press E or Enter to interact.");
        return next;
      });
    }

    function interact() {
      const target = getInteraction(player, direction);

      if (target === "npc") {
        setDialogueOpen(true);
        setDialogueIndex((current) => {
          if (!dialogueOpen) return 0;
          if (current >= npcLines.length - 1) {
            setDialogueOpen(false);
            return 0;
          }
          return current + 1;
        });
        return;
      }

      if (target === "collection") {
        setScreen("collection");
        setNotice("Collection access reached. Module 2 will build selection here.");
        return;
      }

      if (target === "battle") {
        setScreen("battle");
        setNotice("Kween's gate reached. Module 3 will build the battle here.");
        return;
      }

      if (target === "sign") {
        setNotice("Sign: Choose three partners before challenging Kween.");
        return;
      }

      setNotice("There is nothing to inspect from here.");
    }

    function handleKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();

      if (["arrowup", "w"].includes(key)) {
        event.preventDefault();
        move("up");
      } else if (["arrowdown", "s"].includes(key)) {
        event.preventDefault();
        move("down");
      } else if (["arrowleft", "a"].includes(key)) {
        event.preventDefault();
        move("left");
      } else if (["arrowright", "d"].includes(key)) {
        event.preventDefault();
        move("right");
      } else if (["e", "enter"].includes(key)) {
        event.preventDefault();
        interact();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dialogueOpen, direction, player, screen]);

  if (screen === "title") {
    return <TitleScreen onStart={() => setScreen("meadow")} />;
  }

  if (screen === "meadow") {
    return (
      <MeadowScreen
        dialogueIndex={dialogueIndex}
        dialogueOpen={dialogueOpen}
        interaction={interaction}
        notice={notice}
        player={player}
        setScreen={setScreen}
      />
    );
  }

  if (screen === "collection") {
    return (
      <CollectionScreen
        battleTeam={battleTeam}
        selectedMonsters={selectedMonsters}
        setBattleTeam={setBattleTeam}
        setScreen={setScreen}
        setSelectedMonsters={setSelectedMonsters}
      />
    );
  }

  if (screen === "battle") {
    return (
      <BattleScreen
        battleState={battleState}
        battleTeam={battleTeam}
        setBattleState={setBattleState}
        setScreen={setScreen}
      />
    );
  }

  if (screen === "result") {
    return <ResultScreen battleState={battleState} setBattleState={setBattleState} setScreen={setScreen} />;
  }

  return <ResultScreen battleState={battleState} setBattleState={setBattleState} setScreen={setScreen} />;
}

function TitleScreen({ onStart }: { onStart: () => void }) {
  const [audioOn, setAudioOn] = useState(false);

  return (
    <main className="min-h-screen bg-[#102d1f] text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-6 py-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_20rem] lg:items-center">
          <div>
            <p className="mb-3 text-sm font-bold uppercase tracking-wide text-[#f7c948]">Prompt Monsters</p>
            <h1 className="max-w-3xl font-display text-5xl font-black leading-tight sm:text-6xl">Prompt Monsters</h1>
            <p className="mt-5 max-w-xl text-xl leading-8 text-[#d9f8df]">They have billions of parameters. You have one good prompt.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                className="rounded border-2 border-[#f7c948] bg-[#f7c948] px-6 py-3 text-lg font-black text-[#102d1f] shadow-[0_5px_0_#8f6420] transition hover:translate-y-0.5 hover:shadow-[0_3px_0_#8f6420]"
                type="button"
                onClick={onStart}
              >
                Start
              </button>
              <button
                className="rounded border-2 border-[#8bd3dd] bg-[#173f35] px-5 py-3 font-bold text-[#dffcff]"
                type="button"
                aria-pressed={audioOn}
                onClick={() => setAudioOn((value) => !value)}
              >
                Audio {audioOn ? "On" : "Off"}
              </button>
            </div>
          </div>

          <div className="grid aspect-square grid-cols-4 gap-2 border-4 border-[#0b1c15] bg-[#77c66e] p-3 shadow-2xl shadow-black/30">
            {Array.from({ length: 16 }).map((_, index) => (
              <div
                key={index}
                className={`grid place-items-center border border-[#356d41] text-xl font-black ${
                  index % 5 === 0 ? "bg-[#f7c948] text-[#6c421a]" : index % 3 === 0 ? "bg-[#8bd3dd] text-[#17414c]" : "bg-[#4da861]"
                }`}
              >
                {index === 5 ? "?" : index === 10 ? "K" : ""}
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function MeadowScreen({
  dialogueIndex,
  dialogueOpen,
  interaction,
  notice,
  player,
  setScreen,
}: {
  dialogueIndex: number;
  dialogueOpen: boolean;
  interaction: string | null;
  notice: string;
  player: Position;
  setScreen: (screen: AppScreen) => void;
}) {
  return (
    <main className="min-h-screen bg-[#143827] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-5">
        <header className="mb-4 flex flex-col gap-3 border-b-4 border-[#2c6b3f] pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-[#f7c948]">Prompt Meadow</p>
            <h1 className="font-display text-3xl font-black">A tiny field full of big instructions</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="rounded border-2 border-[#8bd3dd] bg-[#173f35] px-3 py-2 font-bold" type="button" onClick={() => setScreen("collection")}>
              Collection
            </button>
            <button className="rounded border-2 border-[#f7c948] bg-[#4b306d] px-3 py-2 font-bold" type="button" onClick={() => setScreen("battle")}>
              Kween Gate
            </button>
          </div>
        </header>

        <section className="grid flex-1 gap-4 lg:grid-cols-[auto_18rem] lg:items-start">
          <div className="overflow-auto rounded border-4 border-[#0b1c15] bg-[#214932] p-3">
            <div
              className="relative grid"
              style={{
                gridTemplateColumns: `repeat(${meadowWidth}, ${tileSize}px)`,
                gridTemplateRows: `repeat(${meadowHeight}, ${tileSize}px)`,
                width: meadowWidth * tileSize,
              }}
              aria-label="Prompt Meadow map"
            >
              {Array.from({ length: meadowWidth * meadowHeight }).map((_, index) => {
                const position = { x: index % meadowWidth, y: Math.floor(index / meadowWidth) };
                const tile = getTile(position);

                return (
                  <div key={keyOf(position)} className={`tile tile-${tile}`} style={{ width: tileSize, height: tileSize }}>
                    {tileLabel(tile)}
                  </div>
                );
              })}
              <div
                className="absolute grid place-items-center border-2 border-[#24130c] bg-[#f1e1b5] text-lg font-black text-[#173f35] shadow-[0_3px_0_#5a3b25]"
                style={{
                  width: tileSize - 4,
                  height: tileSize - 4,
                  left: player.x * tileSize + 2,
                  top: player.y * tileSize + 2,
                }}
                aria-label="Player"
              >
                P
              </div>
            </div>
          </div>

          <aside className="rounded border-4 border-[#0b1c15] bg-[#f5f0d8] p-4 text-[#17251d]">
            <h2 className="text-xl font-black">Controls</h2>
            <p className="mt-2 text-sm font-semibold">Move with arrow keys or WASD. Press E or Enter near people, signs, the collection shrine, or Kween's gate.</p>
            <div className="mt-4 rounded border-2 border-[#b5832b] bg-white p-3 font-bold">{notice}</div>
            {interaction ? <p className="mt-3 rounded bg-[#d9f8df] p-3 text-sm font-bold">Nearby: {interaction}</p> : null}
          </aside>
        </section>

        {dialogueOpen ? (
          <div className="mt-4 rounded border-4 border-[#0b1c15] bg-[#f5f0d8] p-4 text-[#17251d] shadow-xl">
            <p className="text-sm font-black uppercase tracking-wide text-[#8f6420]">Meadow Guide</p>
            <p className="mt-2 text-lg font-bold">{npcLines[dialogueIndex]}</p>
            <p className="mt-2 text-sm font-semibold">Press E or Enter to continue.</p>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function CollectionScreen({
  battleTeam,
  selectedMonsters,
  setBattleTeam,
  setScreen,
  setSelectedMonsters,
}: {
  battleTeam: SelectedTeam | null;
  selectedMonsters: MonsterId[];
  setBattleTeam: (team: SelectedTeam | null) => void;
  setScreen: (screen: AppScreen) => void;
  setSelectedMonsters: (monsters: MonsterId[]) => void;
}) {
  const canStartBattle = selectedMonsters.length === 3;
  const helperText = canStartBattle ? "Team ready for Kween's gate." : `Choose exactly ${3 - selectedMonsters.length} more.`;

  function toggleMonster(id: MonsterId) {
    if (selectedMonsters.includes(id)) {
      setSelectedMonsters(selectedMonsters.filter((monsterId) => monsterId !== id));
      setBattleTeam(null);
      return;
    }

    if (selectedMonsters.length >= 3) {
      return;
    }

    setSelectedMonsters([...selectedMonsters, id]);
    setBattleTeam(null);
  }

  function startBattle() {
    if (!canStartBattle) {
      return;
    }

    const team = selectedMonsters as SelectedTeam;
    setBattleTeam(team);
    setScreen("battle");
  }

  return (
    <main className="min-h-screen bg-[#102d1f] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5">
        <header className="mb-5 flex flex-col gap-3 border-b-4 border-[#2c6b3f] pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-[#f7c948]">Monster Collection</p>
            <h1 className="font-display text-4xl font-black">Choose three Prompt Monsters</h1>
            <p className="mt-2 max-w-2xl text-[#d9f8df]">All five MVP partners are unlocked. Select exactly three distinct monsters for the Kween battle.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="rounded border-2 border-[#8bd3dd] bg-[#173f35] px-4 py-2 font-bold" type="button" onClick={() => setScreen("meadow")}>
              Return to Meadow
            </button>
            <button
              className={`rounded border-2 px-4 py-2 font-black ${
                canStartBattle ? "border-[#f7c948] bg-[#f7c948] text-[#102d1f]" : "border-[#66836f] bg-[#314637] text-[#b8c7bb]"
              }`}
              type="button"
              disabled={!canStartBattle}
              onClick={startBattle}
            >
              Start Battle
            </button>
          </div>
        </header>

        <section className="mb-5 rounded border-4 border-[#0b1c15] bg-[#f5f0d8] p-4 text-[#17251d]">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-black">Selected Team</h2>
              <p className="text-sm font-bold">{helperText}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedMonsters.length === 0 ? <span className="rounded border-2 border-dashed border-[#9b8c62] px-4 py-2 font-bold">No monsters selected</span> : null}
              {selectedMonsters.map((id, index) => {
                const monster = MONSTERS.find((item) => item.id === id)!;
                return (
                  <span key={id} className="rounded border-2 border-[#0b1c15] bg-white px-4 py-2 font-black" style={{ color: monster.primaryColor }}>
                    {index + 1}. {monster.name}
                  </span>
                );
              })}
            </div>
          </div>
          {battleTeam ? <p className="mt-3 text-sm font-bold">Last confirmed team: {battleTeam.join(", ")}</p> : null}
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {MONSTERS.map((monster) => {
            const selected = selectedMonsters.includes(monster.id);
            const disabled = !selected && selectedMonsters.length >= 3;

            return (
              <article
                key={monster.id}
                className={`rounded border-4 p-4 text-[#17251d] shadow-xl ${
                  selected ? "border-[#f7c948] bg-[#fff7cc]" : disabled ? "border-[#52695b] bg-[#d9e2d5]" : "border-[#0b1c15] bg-[#f5f0d8]"
                }`}
              >
                <div className="flex gap-4">
                  <MonsterSprite monster={monster} selected={selected} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-2xl font-black">{monster.name}</h2>
                      {selected ? <span className="rounded bg-[#173f35] px-2 py-1 text-xs font-black uppercase text-white">Selected</span> : null}
                    </div>
                    <p className="mt-1 text-xs font-black uppercase tracking-wide text-[#52695b]">{monster.inspiration}</p>
                    <p className="mt-3 text-sm font-semibold leading-6">{monster.description}</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3">
                  <div className="rounded border-2 border-[#d6b56d] bg-white p-3">
                    <p className="text-xs font-black uppercase tracking-wide text-[#8f6420]">Personality</p>
                    <p className="mt-1 text-sm font-semibold">{monster.personality}</p>
                  </div>
                  <div className="rounded border-2 border-[#8bd3dd] bg-white p-3">
                    <p className="text-xs font-black uppercase tracking-wide text-[#17414c]">{monster.abilityName}</p>
                    <p className="mt-1 text-sm font-semibold">{monster.abilityDescription}</p>
                  </div>
                </div>

                <button
                  className={`mt-4 w-full rounded border-2 px-4 py-3 font-black ${
                    selected
                      ? "border-[#8f6420] bg-white text-[#8f6420]"
                      : disabled
                        ? "border-[#7c8b80] bg-[#c7d2cb] text-[#52695b]"
                        : "border-[#0b1c15] bg-[#173f35] text-white"
                  }`}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleMonster(monster.id)}
                >
                  {selected ? "Remove from Team" : disabled ? "Team Full" : "Add to Team"}
                </button>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}

function MonsterSprite({ monster, selected }: { monster: MonsterDefinition; selected: boolean }) {
  return (
    <div
      className={`monster-sprite monster-sprite-${monster.id} ${selected ? "monster-sprite-selected" : ""}`}
      aria-label={`${monster.name} temporary pixel sprite`}
      title={`${monster.name} temporary pixel sprite`}
    >
      <span className="monster-face">{monster.id === "coddy" ? "</>" : monster.id === "giptoo" ? "2" : monster.id === "astra" ? "*" : monster.id === "sori" ? "~" : ")"}</span>
    </div>
  );
}

function BattleScreen({
  battleState,
  battleTeam,
  setBattleState,
  setScreen,
}: {
  battleState: BattleState | null;
  battleTeam: SelectedTeam | null;
  setBattleState: (state: BattleState | null) => void;
  setScreen: (screen: AppScreen) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [evidence, setEvidence] = useState<ResearchResult[]>([]);
  const [researchState, setResearchState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [researchMessage, setResearchMessage] = useState("");
  const [researchUsed, setResearchUsed] = useState(false);
  const [interpretState, setInterpretState] = useState<"idle" | "loading">("idle");
  const [battleSessionId] = useState(createBattleSessionId);
  const state = battleTeam ? (battleState ?? createBattleState(battleTeam)) : null;

  useEffect(() => {
    if (battleTeam && !battleState) {
      setBattleState(createBattleState(battleTeam));
    }
  }, [battleTeam, battleState, setBattleState]);

  useEffect(() => {
    if (battleState?.status === "victory" || battleState?.status === "defeat") {
      setScreen("result");
    }
  }, [battleState?.status, setScreen]);

  if (!battleTeam || !state) {
    return (
      <main className="min-h-screen bg-[#102d1f] text-white">
        <section className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-6">
          <p className="text-sm font-bold uppercase tracking-wide text-[#f7c948]">Kween Gate</p>
          <h1 className="mt-3 font-display text-4xl font-black">Choose a team first</h1>
          <p className="mt-4 text-lg text-[#d9f8df]">The battle requires exactly three selected monsters.</p>
          <button className="mt-8 w-fit rounded border-2 border-[#f7c948] bg-[#4b306d] px-5 py-3 font-bold" type="button" onClick={() => setScreen("collection")}>
            Open Collection
          </button>
        </section>
      </main>
    );
  }

  function commitAction(suggestion: EvaluatorSuggestion) {
    if (!state || state.status !== "active") return;
    const validated = validateSuggestion(state, suggestion);
    if (validated.actions.length === 0) {
      setBattleState({ ...state, log: [...state.log.slice(-7), validated.explanation] });
      return;
    }

    let next = { ...state, log: [...state.log, validated.explanation] };
    validated.actions.forEach((action) => {
      next = applyPlayerAction(next, action);
    });
    next = updateBattleStatus(next);
    if (next.status === "active") {
      next = applyKweenResponse(next);
    }
    setBattleState(next);
  }

  function useAbility(monsterId: MonsterId) {
    const actionId = getMonster(monsterId).abilityId as BattleActionId;
    commitAction({
      actions: [{ monsterId, actionId }],
      explanation: `${getMonster(monsterId).name} acts on your command.`,
    });
  }

  function submitPrompt() {
    if (!state) return;
    const suggestion = evaluatePrompt(prompt, state.team, state.kweenShield, getCurrentChallenge(state));
    commitAction(suggestion);
    setPrompt("");
  }

  async function runEvidenceHunt() {
    if (researchUsed || researchState === "loading") return;
    setResearchUsed(true);
    setResearchState("loading");
    const result = await searchEvidence("limitations of AI benchmarks, benchmark contamination, task-specific performance, and whether benchmark scores measure general intelligence", battleSessionId);
    if (!result.ok) {
      setResearchState("error");
      setResearchMessage(result.error);
      return;
    }
    setEvidence(result.results);
    setResearchState("ready");
    setResearchMessage(result.results.length ? "Evidence found. Inspect the sources, then write a counter-strategy." : "No sources returned. The local evaluator is still available.");
  }

  async function interpretStrategy() {
    if (!state || !prompt.trim() || interpretState === "loading") return;
    setInterpretState("loading");
    const result = await interpretBattle({
      instruction: prompt,
      selectedMonsterIds: state.team.map((member) => member.id),
      battleSummary: `Kween has ${state.kweenHp} HP and ${state.kweenShield} shield. Its next move is ${kweenMoveNames[getNextKweenMove(state)]}.`,
      evidence,
      battleId: battleSessionId,
    });
    setInterpretState("idle");
    if (result.ok) {
      commitAction({ actions: result.actions, explanation: result.explanation });
    } else {
      const fallback = evaluatePrompt(prompt, state.team, state.kweenShield, getCurrentChallenge(state));
      commitAction({ ...fallback, explanation: `${result.error} Local evaluator used instead. ${fallback.explanation}` });
    }
    setPrompt("");
  }

  const nextMove = getNextKweenMove(state);
  const challenge = getCurrentChallenge(state);

  return (
    <main className="min-h-screen bg-[#18122b] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5">
        <header className="mb-5 flex flex-col gap-3 border-b-4 border-[#5b4b8a] pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-[#8bd3dd]">Kween Arena</p>
            <h1 className="font-display text-4xl font-black">Benchmark Brag Battle</h1>
            <p className="mt-2 max-w-2xl text-[#e8ddff]">Use abilities or a clear natural-language strategy. The local engine validates every action.</p>
          </div>
          <button className="w-fit rounded border-2 border-[#8bd3dd] bg-[#173f35] px-4 py-2 font-bold" type="button" onClick={() => setScreen("collection")}>
            Change Team
          </button>
        </header>

        <section className="grid gap-4 xl:grid-cols-[1fr_22rem]">
          <div className="grid gap-4">
            <div className="rounded border-4 border-[#0b1c15] bg-[#fff4c2] p-4 text-[#17251d]">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-[#8a5b00]">Kween's problem</p>
                  <h2 className="mt-1 text-2xl font-black">{challenge.title}</h2>
                  <p className="mt-2 font-bold">“{challenge.claim}”</p>
                  <p className="mt-2 text-sm font-semibold">{challenge.task}</p>
                </div>
                <div className="rounded border-2 border-[#c89219] bg-white px-3 py-2 text-sm font-black text-[#6c4800]">Practice: {challenge.skill}</div>
              </div>
            </div>
            <div className="rounded border-4 border-[#0b1c15] bg-[#f5f0d8] p-4 text-[#17251d]">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-4">
                  <div className="kween-sprite" aria-label="Kween temporary pixel sprite">K</div>
                  <div>
                    <h2 className="text-2xl font-black">Kween</h2>
                    <p className="font-bold">Shield {state.kweenShield}/{BATTLE_CONFIG.kweenMaxShield}</p>
                    <HpBar current={state.kweenHp} max={BATTLE_CONFIG.kweenMaxHp} />
                  </div>
                </div>
                <div className="rounded border-2 border-[#6043a4] bg-white p-3 font-black">
                  Next pattern slot: {state.revealedMove ? kweenMoveNames[state.revealedMove] : kweenMoveNames[nextMove]}
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {state.team.map((member) => {
                const monster = getMonster(member.id);
                return (
                  <article key={member.id} className="rounded border-4 border-[#0b1c15] bg-[#f5f0d8] p-3 text-[#17251d]">
                    <div className="flex items-center gap-3">
                      <MonsterSprite monster={monster} selected={member.hp > 0} />
                      <div className="min-w-0">
                        <h3 className="text-xl font-black">{monster.name}</h3>
                        <p className="text-sm font-bold">{monster.abilityName}</p>
                        <HpBar current={member.hp} max={BATTLE_CONFIG.playerMonsterMaxHp} />
                      </div>
                    </div>
                    <button
                      className="mt-3 w-full rounded border-2 border-[#0b1c15] bg-[#173f35] px-3 py-2 font-black text-white disabled:bg-[#7c8b80]"
                      type="button"
                      disabled={member.hp <= 0 || state.status !== "active"}
                      onClick={() => useAbility(member.id)}
                    >
                      Use Ability
                    </button>
                  </article>
                );
              })}
            </div>

            <div className="rounded border-4 border-[#0b1c15] bg-[#f5f0d8] p-4 text-[#17251d]">
              <h2 className="text-xl font-black">Strategy Prompt</h2>
              <textarea
                className="mt-3 min-h-24 w-full rounded border-2 border-[#0b1c15] bg-white p-3 font-semibold text-[#17251d]"
                value={prompt}
                placeholder="Example: Astra challenge Kween's benchmark claim with evidence, then Coddy break the shield."
                onChange={(event) => setPrompt(event.target.value)}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="rounded border-2 border-[#f7c948] bg-[#f7c948] px-4 py-2 font-black text-[#102d1f]" type="button" onClick={submitPrompt}>
                  Submit Strategy
                </button>
                <button className="rounded border-2 border-[#8bd3dd] bg-[#173f35] px-4 py-2 font-black text-white disabled:cursor-not-allowed disabled:opacity-50" type="button" onClick={interpretStrategy} disabled={!prompt.trim() || interpretState === "loading" || state.status !== "active"}>
                  {interpretState === "loading" ? "Interpreting..." : "Ask Kween Interpreter"}
                </button>
                {["Sori make a decoy", "Soli heal the team", "Coddy break the shield"].map((example) => (
                  <button key={example} className="rounded border-2 border-[#8bd3dd] bg-white px-3 py-2 text-sm font-bold text-[#17414c]" type="button" onClick={() => setPrompt(example)}>
                    {example}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded border-4 border-[#0b1c15] bg-[#e8ddff] p-4 text-[#17251d]">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-xl font-black">Evidence Hunt</h2>
                  <p className="mt-1 max-w-2xl text-sm font-semibold">Astra can search for evidence about why one benchmark score does not prove general intelligence.</p>
                </div>
                <button className="rounded border-2 border-[#6043a4] bg-white px-4 py-2 font-black text-[#392465] disabled:cursor-not-allowed disabled:opacity-50" type="button" onClick={runEvidenceHunt} disabled={researchUsed || researchState === "loading" || state.status !== "active"}>
                  {researchState === "loading" ? "Searching..." : researchUsed ? "Search Used" : "Run Evidence Hunt"}
                </button>
              </div>
              {researchMessage ? <p className="mt-3 rounded border-2 border-[#6043a4] bg-white p-2 text-sm font-bold">{researchMessage}</p> : null}
              {evidence.length ? (
                <div className="mt-3 grid gap-2">
                  {evidence.map((source) => (
                    <article key={source.id} className="rounded border-2 border-[#6043a4] bg-white p-3">
                      <a className="font-black text-[#392465] underline" href={source.url} target="_blank" rel="noreferrer">{source.title}</a>
                      <p className="text-xs font-bold uppercase tracking-wide">{source.domain}{source.publishedDate ? ` | ${source.publishedDate}` : ""}</p>
                      {source.excerpt ? <p className="mt-1 text-sm font-semibold">{source.excerpt}</p> : null}
                    </article>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <aside className="rounded border-4 border-[#0b1c15] bg-[#f5f0d8] p-4 text-[#17251d]">
            <h2 className="text-xl font-black">Battle Log</h2>
            <ol className="mt-3 space-y-2">
              {state.log.map((entry, index) => (
                <li key={`${entry}-${index}`} className="rounded border-2 border-[#d6b56d] bg-white p-2 text-sm font-semibold">
                  {entry}
                </li>
              ))}
            </ol>
          </aside>
        </section>
      </div>
    </main>
  );
}

function HpBar({ current, max }: { current: number; max: number }) {
  const percent = Math.max(0, Math.round((current / max) * 100));
  return (
    <div className="mt-2 h-4 w-full min-w-32 border-2 border-[#0b1c15] bg-white">
      <div className="h-full bg-[#58d68d]" style={{ width: `${percent}%` }} />
    </div>
  );
}

function ResultScreen({
  battleState,
  setBattleState,
  setScreen,
}: {
  battleState: BattleState | null;
  setBattleState: (state: BattleState | null) => void;
  setScreen: (screen: AppScreen) => void;
}) {
  const victory = battleState?.status === "victory";

  function retry() {
    if (battleState) {
      const team = battleState.team.map((member) => member.id) as SelectedTeam;
      setBattleState(createBattleState(team));
      setScreen("battle");
    } else {
      setScreen("collection");
    }
  }

  return (
    <main className="min-h-screen bg-[#102d1f] text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-6">
        <p className="text-sm font-bold uppercase tracking-wide text-[#f7c948]">Battle Result</p>
        <h1 className="mt-3 font-display text-5xl font-black">{victory ? "Victory" : "Defeat"}</h1>
        <p className="mt-4 text-lg text-[#d9f8df]">
          {victory
            ? "Kween's crown now displays a tiny badge reading: context beats bragging."
            : "Kween is still posing dramatically. The meadow recommends a cleaner prompt and another try."}
        </p>
        {victory ? <div className="mt-6 w-fit rounded border-4 border-[#0b1c15] bg-[#f7c948] px-5 py-3 font-black text-[#102d1f]">Badge earned: Benchmark Buster</div> : null}
        <div className="mt-8 flex flex-wrap gap-3">
          <button className="rounded border-2 border-[#f7c948] bg-[#f7c948] px-5 py-3 font-black text-[#102d1f]" type="button" onClick={retry}>
            Retry
          </button>
          <button className="rounded border-2 border-[#8bd3dd] bg-[#173f35] px-5 py-3 font-bold" type="button" onClick={() => setScreen("meadow")}>
            Return to Meadow
          </button>
        </div>
      </section>
    </main>
  );
}
