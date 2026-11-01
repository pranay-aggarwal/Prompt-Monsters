import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { ASSETS } from "../shared/assets";
import type { MonsterId } from "../shared/types";
import { MONSTERS } from "../shared/monsters";
import { AtlasArt, CharacterArt, GuideArt, MonsterArt } from "./Art";
import { BORDER_TREES, FLOWERS, HEIGHT, LANDMARKS, ROCKS, TREES, WIDTH, blocked, distance, isPath, keyOf, type Direction, type Position, type WildMonster } from "../game/meadow";

const tileStyle = (p: Position, layer = 10): CSSProperties => ({ left: `${p.x / WIDTH * 100}%`, top: `${p.y / HEIGHT * 100}%`, width: `${100 / WIDTH}%`, height: `${100 / HEIGHT}%`, zIndex: layer });

export function MeadowScene({ player, direction = "down", wild = [], onTile, onMonster, decorative = false }: { player?: Position; direction?: Direction; wild?: WildMonster[]; onTile?: (p: Position) => void; onMonster?: (id: MonsterId) => void; decorative?: boolean }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 768, height: 528 });
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const fit = () => {
      const scale = Math.min(element.clientWidth / 768, element.clientHeight / 528);
      setSize({ width: 768 * scale, height: 528 * scale });
    };
    fit();
    const observer = new ResizeObserver(fit); observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return <div ref={viewport} className={`world-scene ${decorative ? "world-decorative" : ""}`} aria-label={decorative ? "A sunlit meadow" : "Prompt Meadow. Find monsters, walk up, and press E to collect them."}>
    <div className="world-board" style={{ width: size.width, height: size.height }}>
      <div className="world-ground" />
      {Array.from({ length: WIDTH * HEIGHT }, (_, i) => {
        const position = { x: i % WIDTH, y: Math.floor(i / WIDTH) };
        return <div key={i} className={`world-tile ${isPath(position) ? "world-path" : ""}`} data-tile={keyOf(position)} data-walkable={!blocked(position)} style={tileStyle(position, 0)} onClick={onTile ? () => onTile(position) : undefined}><AtlasArt id={isPath(position) ? "path" : "grass"} /></div>;
      })}
      {[...BORDER_TREES, ...TREES].map((p, i) => <div className="world-prop world-tree" key={`t${i}`} style={tileStyle(p, 10)}><AtlasArt id={i % 3 === 0 ? "large-tree" : "tree"} /></div>)}
      {ROCKS.map(p => <div className="world-prop" key={keyOf(p)} style={tileStyle(p, 11)}><AtlasArt id="rock" /></div>)}
      {FLOWERS.map(p => <div className="world-prop world-flowers" key={keyOf(p)} style={tileStyle(p, 2)}><AtlasArt id="flowers" /></div>)}
      <div className="world-prop world-pond" style={tileStyle({ x: 9, y: 4 }, 3)}><AtlasArt id="pond" /></div>
      <div className="world-prop world-mushroom" style={tileStyle({ x: 8, y: 6 }, 2)}><AtlasArt id="mushroom" /></div>
      <div className="world-landmark world-shrine" style={tileStyle(LANDMARKS.shrine, 15)}><span className="shrine-light">✦</span><span className="landmark-label">PARTY SHRINE</span></div>
      <div className="world-landmark world-gate" style={tileStyle(LANDMARKS.gate, 15)}><span className="gate-arch">♛</span><span className="landmark-label">KWEEN'S GATE</span></div>
      <div className="world-landmark world-sign" style={tileStyle(LANDMARKS.sign, 15)}><AtlasArt id="sign" /></div>
      <div className="world-landmark world-guide" style={tileStyle(LANDMARKS.guide, 20)}><GuideArt /><span className="guide-question">!</span>{player && distance(player, LANDMARKS.guide) <= 1 && <span className="landmark-label">E · TALK</span>}</div>
      {wild.map(spawn => {
        const monster = MONSTERS.find(m => m.id === spawn.id)!;
        return <button type="button" className="world-creature" key={spawn.id} data-monster-id={spawn.id} data-position={keyOf(spawn.position)} aria-label={`Approach ${monster.name}`} style={tileStyle(spawn.position, 30)} onClick={() => onMonster?.(spawn.id)}><span className="creature-shadow" /><MonsterArt monster={monster} /><span className="creature-label">{monster.name}</span>{player && distance(player, spawn.position) <= 1 && <span className="creature-interact">E · MEET</span>}</button>;
      })}
      {player && <div className={`world-player facing-${direction}`} data-position={keyOf(player)} style={tileStyle(player, 50)}><CharacterArt id={`player-${direction}`} src={ASSETS.player[direction]} label="Your explorer" /><span className="player-marker">YOU</span></div>}
      <div className="world-light" />
    </div>
  </div>;
}
