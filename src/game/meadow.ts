export type Position = { x: number; y: number };
export type Direction = "down" | "left" | "right" | "up";
export const WIDTH = 16;
export const HEIGHT = 11;
export const START = { x: 2, y: 8 };
export const LANDMARKS = { guide: { x: 4, y: 6 }, shrine: { x: 2, y: 2 }, gate: { x: 13, y: 5 }, sign: { x: 11, y: 7 } };
export type Landmark = keyof typeof LANDMARKS;
export const keyOf = (p: Position) => `${p.x},${p.y}`;
export const distance = (a: Position, b: Position) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export function facing(p: Position, d: Direction): Position { return { x: p.x + (d === "right" ? 1 : d === "left" ? -1 : 0), y: p.y + (d === "down" ? 1 : d === "up" ? -1 : 0) }; }
export const TREES = [{ x: 5, y: 4 }, { x: 6, y: 4 }, { x: 12, y: 2 }, { x: 6, y: 6 }, { x: 6, y: 7 }];
export const ROCKS = [{ x: 3, y: 4 }, { x: 3, y: 5 }];
export const FLOWERS = [{ x: 7, y: 1 }, { x: 8, y: 1 }, { x: 2, y: 3 }, { x: 5, y: 8 }, { x: 12, y: 8 }, { x: 2, y: 6 }, { x: 11, y: 3 }, { x: 9, y: 9 }, { x: 13, y: 9 }];
const water = [{ x: 9, y: 4 }, { x: 10, y: 4 }, { x: 9, y: 5 }, { x: 10, y: 5 }];
const blockedTiles = new Set([...TREES, ...ROCKS, ...water, LANDMARKS.guide].map(keyOf));
export const blocked = (p: Position) => p.x < 1 || p.y < 1 || p.x >= WIDTH - 1 || p.y >= HEIGHT - 1 || blockedTiles.has(keyOf(p));
export const isPath = (p: Position) => (p.y === 8 && p.x >= 2 && p.x <= 13) || (p.x === 7 && p.y >= 2 && p.y <= 8) || (p.y === 2 && p.x >= 2 && p.x <= 7) || (p.y === 5 && p.x >= 11 && p.x <= 13) || (p.x === 13 && p.y >= 5 && p.y <= 8) || (p.x === 4 && p.y >= 6 && p.y <= 8);
export function nearby(p: Position): Landmark | null { for (const [name, position] of Object.entries(LANDMARKS)) if (distance(p, position) <= 1) return name as Landmark; return null; }
export const GUIDE_LINES = [
  "Welcome, explorer! Five little monsters are hiding around the meadow. They choose new spots each adventure. Look for them among the grass and flowers.",
  "Walk up to a monster and press E, or click it to walk over. Collect the companions you meet, then visit your collection to choose a team of three.",
  "Kween thinks a shiny score proves everything. Read her claim, tell your partner what to investigate, and ask for a way to check the answer.",
  "Your first prompt doesn't have to be perfect. Read the feedback, change one thing, and try again. Ready? Your companions are waiting!"
];
import { MONSTERS } from "../shared/monsters";
import type { MonsterId } from "../shared/types";


export type WildMonster = { id: MonsterId; position: Position };
export type Exploration = { player: Position; direction: Direction; wild: WildMonster[]; collected: MonsterId[] };

export const BORDER_TREES = Array.from({ length: WIDTH * 2 + (HEIGHT - 2) * 2 }, (_, i) => i < WIDTH ? { x: i, y: 0 } : i < WIDTH * 2 ? { x: i - WIDTH, y: HEIGHT - 1 } : i < WIDTH * 2 + HEIGHT - 2 ? { x: 0, y: i - WIDTH * 2 + 1 } : { x: WIDTH - 1, y: i - WIDTH * 2 - HEIGHT + 3 });

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1)))); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}

export function createExploration(random: () => number = Math.random): Exploration {
  const candidates: Position[] = [];
  for (let y = 1; y < HEIGHT - 1; y++) for (let x = 1; x < WIDTH - 1; x++) {
    const p = { x, y };
    if (!blocked(p) && !isPath(p) && distance(p, START) >= 3 && Object.values(LANDMARKS).every(l => distance(p, l) >= 3)) candidates.push(p);
  }
  const spots = shuffled(candidates, random);
  const chosen: Position[] = [];
  for (const p of spots) if (chosen.every(other => distance(other, p) >= 2)) chosen.push(p);
  const species = shuffled(MONSTERS, random);
  return { player: { ...START }, direction: "down", wild: species.map((monster, i) => ({ id: monster.id, position: chosen[i] })), collected: [] };
}

export function moveExplorer(world: Exploration, direction: Direction): Exploration {
  const position = facing(world.player, direction);
  const occupied = world.wild.some(m => distance(m.position, position) === 0);
  return { ...world, direction, player: blocked(position) || occupied ? world.player : position };
}

export const nearbyMonster = (world: Exploration) => world.wild.find(m => distance(m.position, world.player) <= 1) ?? null;

export function collectMonster(world: Exploration, id: MonsterId): Exploration {
  const monster = world.wild.find(m => m.id === id);
  if (!monster || distance(world.player, monster.position) > 1 || world.collected.includes(id)) return world;
  return { ...world, wild: world.wild.filter(m => m.id !== id), collected: [...world.collected, id] };
}

export function toggleParty(selected: MonsterId[], collected: MonsterId[], id: MonsterId): MonsterId[] {
  if (!collected.includes(id)) throw new Error("Find and collect this monster in the meadow first.");
  if (selected.includes(id)) return selected.filter(value => value !== id);
  if (selected.length >= 3) throw new Error("Your party is full. Remove a companion before adding another.");
  return [...selected, id];
}

/** Shortest legal click-to-walk route; occupied target tiles are approached from beside them. */
export function pathTo(world: Exploration, target: Position, approach = false): Position[] {
  const queue: { position: Position; path: Position[] }[] = [{ position: world.player, path: [] }];
  const seen = new Set([keyOf(world.player)]);
  const occupied = new Set(world.wild.map(m => keyOf(m.position)));
  for (let i = 0; i < queue.length; i++) {
    const { position, path } = queue[i];
    if (distance(position, target) <= (approach ? 1 : 0)) return path;
    for (const direction of ["up", "left", "down", "right"] as Direction[]) {
      const next = facing(position, direction);
      if (blocked(next) || occupied.has(keyOf(next)) || seen.has(keyOf(next))) continue;
      seen.add(keyOf(next)); queue.push({ position: next, path: [...path, next] });
    }
  }
  return [];
}
