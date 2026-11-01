import { useEffect, useRef, useState } from "react";
import { Title, Collection, Result } from "./components/AdventureScreens";
import { Battle } from "./components/BattleScreen";
import { AtlasArt, GuideArt, MonsterArt } from "./components/Art";
import { EncounterDialog, type Encounter } from "./components/EncounterDialog";
import { Header } from "./components/UI";
import { MeadowScene } from "./components/MeadowScene";
import { KWEEN_SCENARIOS } from "./shared/scenarios";
import type { AppScreen } from "./shared/navigation";
import type { MonsterId, SelectedTeam } from "./shared/types";
import { createBattle, monsterFor, type BattleState } from "./game/battle";
import { collectMonster, createExploration, distance, facing, GUIDE_LINES, moveExplorer, nearby, nearbyMonster, pathTo, type Direction, type Landmark, type Position } from "./game/meadow";

export function App() {
  const [screen, setScreen] = useState<AppScreen>("title");
  const [selected, setSelected] = useState<MonsterId[]>([]);
  const [scenarioId, setScenarioId] = useState(KWEEN_SCENARIOS[0].id);
  const [battle, setBattle] = useState<BattleState | null>(null);
  const [world, setWorld] = useState(createExploration);
  const [route, setRoute] = useState<Position[]>([]);
  const [walkTarget, setWalkTarget] = useState<MonsterId | null>(null);
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [dialogue, setDialogue] = useState<number | null>(null);
  const [metGuide, setMetGuide] = useState(false);
  const [notice, setNotice] = useState("Look for monsters in the grass. Click one to walk over, or approach and press E.");
  const region = useRef<HTMLDivElement>(null);
  const { player, direction, wild, collected } = world;
  const target = nearby(player);
  const creature = nearbyMonster(world);
  useEffect(() => { region.current?.focus(); window.scrollTo(0, 0); }, [screen]);

  function stopWalking() { setRoute([]); setWalkTarget(null); }
  function move(d: Direction) {
    if (dialogue !== null || encounter) return;
    stopWalking();
    const next = facing(player, d);
    const found = wild.find(m => distance(m.position, next) === 0);
    if (found) { setWorld(current => ({ ...current, direction: d })); setEncounter({ id: found.id, collected: false }); return; }
    setWorld(current => moveExplorer(current, d));
    setNotice("Find a monster, walk up, and press E to collect it. Build your team after collecting three.");
  }
  function openCollection() { stopWalking(); setEncounter(null); setDialogue(null); setScreen("collection"); }
  function startBattle() {
    if (selected.length !== 3 || selected.some(id => !collected.includes(id))) { openCollection(); return; }
    setBattle(createBattle(selected as SelectedTeam, scenarioId)); setScreen("battle");
  }
  function interact() {
    stopWalking();
    if (encounter) return;
    if (dialogue !== null) { if (dialogue >= GUIDE_LINES.length - 1) { setDialogue(null); setMetGuide(true); } else setDialogue(dialogue + 1); return; }
    if (creature) setEncounter({ id: creature.id, collected: false });
    else if (target === "guide") setDialogue(0);
    else if (target === "shrine") openCollection();
    else if (target === "gate") startBattle();
    else if (target === "sign") setNotice("FIELD NOTE · Give one clear goal, useful context, and a way to check the answer. A longer prompt isn't always a better prompt!");
    else setNotice("Find a monster in the grass and walk next to it. Press E to meet and collect it.");
  }
  function approachMonster(id: MonsterId) {
    if (encounter || dialogue !== null) return;
    const found = wild.find(m => m.id === id);
    if (!found) return;
    if (distance(player, found.position) <= 1) { stopWalking(); setEncounter({ id, collected: false }); return; }
    const path = pathTo(world, found.position, true);
    if (path.length) { setRoute(path); setWalkTarget(id); }
  }
  function collectEncounter() {
    if (!encounter || encounter.collected) return;
    const next = collectMonster(world, encounter.id);
    if (next === world) return;
    setWorld(next); setEncounter({ ...encounter, collected: true });
    setNotice(`${monsterFor(encounter.id).name} joined your collection! ${next.collected.length}/5 found. ${next.collected.length >= 3 ? "Open My party to choose your team." : "Keep exploring to find three companions."}`);
  }
  useEffect(() => {
    if (screen !== "meadow" || dialogue !== null || encounter) return;
    if (!route.length) {
      if (walkTarget) {
        const found = wild.find(m => m.id === walkTarget);
        if (found && distance(player, found.position) <= 1) setEncounter({ id: found.id, collected: false });
        setWalkTarget(null);
      }
      return;
    }
    const timer = window.setTimeout(() => {
      const next = route[0];
      const d: Direction = next.x > player.x ? "right" : next.x < player.x ? "left" : next.y > player.y ? "down" : "up";
      setWorld(current => moveExplorer(current, d)); setRoute(remaining => remaining.slice(1));
    }, 100);
    return () => window.clearTimeout(timer);
  }, [screen, dialogue, encounter, route, walkTarget, wild, player]);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (screen !== "meadow" || encounter || event.ctrlKey || event.metaKey || event.altKey || (event.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(event.target.tagName))) return;
      const key = event.key.toLowerCase();
      if (key === "enter" && event.target instanceof HTMLButtonElement) return;
      const dirs: Record<string, Direction> = { w: "up", arrowup: "up", s: "down", arrowdown: "down", a: "left", arrowleft: "left", d: "right", arrowright: "right" };
      if (dirs[key]) { event.preventDefault(); move(dirs[key]); }
      if ((key === "e" || key === "enter") && !event.repeat) { event.preventDefault(); interact(); }
      if (key === "escape") { setDialogue(null); stopWalking(); }
    }
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  });
  function onTile(p: Position) {
    if (dialogue !== null || encounter) return;
    setWalkTarget(null); setRoute(pathTo(world, p)); region.current?.focus({ preventScroll: true });
  }
  function newAdventure() {
    setWorld(createExploration()); setSelected([]); setBattle(null); setDialogue(null); setEncounter(null); setMetGuide(false); stopWalking();
    setNotice("Look for monsters in the grass. Click one to walk over, or approach and press E."); setScreen("meadow");
  }
  return <div className="app" ref={region} tabIndex={-1}>
    {screen === "title" ? <Title onStart={newAdventure} /> : screen === "meadow" ? <>
      <Header screen={screen}><button className="button button-dark button-small" onClick={openCollection}>✦ My party <span>{selected.length}/3</span></button></Header>
      <main className="meadow-page page-width"><div className="page-heading"><div><p className="eyebrow"><span className="status-dot" /> ROUTE 01 · FIND YOUR COMPANIONS</p><h1>Prompt Meadow<span className="heading-star">✳</span></h1><p>Explore, encounter, collect. Your team starts out here.</p></div><span className="discovery-counter" aria-live="polite"><strong>{collected.length} / 5</strong> MONSTERS COLLECTED</span></div>
        <div className="explore-layout"><section className="world-frame"><div className="world-topline"><span>✦ PROMPT MEADOW</span><span>{wild.length ? `${wild.length} COMPANIONS TO FIND` : "EVERYONE FOUND · CHOOSE YOUR TEAM"}</span></div><MeadowScene player={player} direction={direction} wild={wild} onTile={onTile} onMonster={approachMonster} />
          <div className="world-bottomline"><div className="movement-hint"><kbd>WASD</kbd> / <kbd>↑↓←→</kbd><span>Move · click ground to walk</span></div><div className="touch-controls" aria-label="On-screen movement">{(["up", "left", "down", "right"] as Direction[]).map(d => <button type="button" key={d} className={`dpad-${d}`} aria-label={`Move ${d}`} disabled={dialogue !== null || !!encounter} onClick={() => move(d)}>{({ up: "↑", left: "←", down: "↓", right: "→" })[d]}</button>)}</div><button className="interact-button" onClick={interact}><kbd>E</kbd> {creature ? `Meet ${monsterFor(creature.id).name}` : target ? ({ guide: "Talk to guide", shrine: "Open party", gate: "Challenge Kween", sign: "Read field note" } as Record<Landmark, string>)[target] : "Interact"}</button></div>
        </section><aside className="field-sidebar"><div className="quest-card"><p className="eyebrow">YOUR FIRST ADVENTURE</p><h2>Find your little legends.</h2><p>The meadow's monsters appear in different places each adventure. Go say hello.</p><ol className="quest-list"><li className={collected.length >= 3 ? "done" : ""}><span>{collected.length >= 3 ? "✓" : "1"}</span><div><strong>Find & collect three</strong><small>{collected.length}/5 collected · walk up or click a monster.</small></div></li><li className={selected.length === 3 ? "done" : ""}><span>{selected.length === 3 ? "✓" : "2"}</span><div><strong>Build your team</strong><small>Choose three from your collection.</small></div></li><li><span>3</span><div><strong>Challenge the crown</strong><small>Bring your team to Kween's Gate.</small></div></li></ol></div><div className="party-preview"><div className="section-label"><span>YOUR COLLECTION</span><span>{collected.length}/5</span></div><div className="collection-preview-slots">{[0, 1, 2, 3, 4].map(i => <div key={i}>{collected[i] ? <MonsterArt monster={monsterFor(collected[i])} /> : <span>?</span>}</div>)}</div><button className="text-button" onClick={openCollection}>{collected.length >= 3 ? "Choose your team" : "View collection"} <span>↗</span></button></div><div className="field-note"><AtlasArt id="sparkle" /><p>{metGuide ? "Different minds make a stronger team." : "Need a hand? The meadow guide is by the lower path."}</p></div></aside></div>
        <section className={`dialogue-panel ${dialogue !== null ? "dialogue-active" : ""}`} aria-live="polite"><div className="guide-avatar"><GuideArt /></div><div><span className="dialogue-speaker">{dialogue !== null ? "MEADOW GUIDE" : "EXPLORER'S NOTE"}</span><p>{dialogue !== null ? GUIDE_LINES[dialogue] : notice}</p></div>{dialogue !== null && <button className="button button-dark button-small" onClick={interact}>{dialogue === GUIDE_LINES.length - 1 ? "Let's go!" : "Continue →"}</button>}</section>
      </main>{encounter && <EncounterDialog key={encounter.id} encounter={encounter} count={collected.length} onCollect={collectEncounter} onClose={() => setEncounter(null)} onTeam={openCollection} />}</> : screen === "collection" ? <Collection collected={collected} selected={selected} setSelected={setSelected} scenarioId={scenarioId} setScenarioId={setScenarioId} onBack={() => setScreen("meadow")} onStart={startBattle} /> : screen === "battle" && battle ? <Battle state={battle} onChange={setBattle} onBack={openCollection} onResult={() => setScreen("result")} /> : battle ? <Result state={battle} onRetry={() => { setBattle(createBattle(battle.team.map(m => m.id) as SelectedTeam, battle.scenarioId)); setScreen("battle"); }} onMeadow={() => setScreen("meadow")} /> : null}
    <footer className="app-footer"><span>SMALL MONSTERS. BIG IDEAS.</span><span>A little curiosity goes a long way. <b>✦</b></span></footer>
  </div>;
}
