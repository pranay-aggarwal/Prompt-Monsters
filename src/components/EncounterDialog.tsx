import { useEffect, useRef } from "react";
import { MonsterArt } from "./Art";
import { monsterFor } from "../game/battle";
import type { MonsterId } from "../shared/types";
import { ROLES, palette } from "./UI";

export type Encounter = { id: MonsterId; collected: boolean };

export function EncounterDialog({ encounter, count, onCollect, onClose, onTeam }: { encounter: Encounter; count: number; onCollect: () => void; onClose: () => void; onTeam: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const monster = monsterFor(encounter.id);
  useEffect(() => {
    const element = dialog.current!;
    const previous = document.activeElement as HTMLElement | null;
    element.showModal();
    return () => { element.close(); previous?.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={dialog} className="encounter-dialog" style={palette(encounter.id)} aria-labelledby="encounter-title" onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => { event.stopPropagation(); if (event.key === "Escape") { event.preventDefault(); onClose(); } }}>
    <button type="button" className="encounter-close" aria-label="Close encounter" onClick={onClose}>×</button>
    <div className="encounter-portrait"><span>✦</span><MonsterArt monster={monster} /></div>
    <p className="eyebrow">{encounter.collected ? "A NEW COMPANION!" : "LOOK WHO YOU FOUND"}</p>
    <h2 id="encounter-title">{encounter.collected ? `${monster.name} joined your collection!` : `You encountered ${monster.name}!`}</h2>
    <p className="encounter-role">{ROLES[monster.id]} · {monster.abilityName}</p>
    <p>{encounter.collected ? `${count} of 5 collected. ${count >= 3 ? "You can now choose a team of three, or keep exploring to find everyone." : `Find ${3 - count} more to start building your team.`}` : `${monster.personality} Invite this little monster to join your collection.`}</p>
    <div className="encounter-actions">{encounter.collected ? <><button autoFocus className="button button-dark" onClick={onClose}>Keep exploring →</button>{count >= 3 && <button className="button button-coral" onClick={onTeam}>Build your team ↗</button>}</> : <><button autoFocus className="button button-dark" onClick={onCollect}>Collect {monster.name} <span>✦</span></button><button className="text-button" onClick={onClose}>Leave it here for now</button></>}</div>
  </dialog>;
}
