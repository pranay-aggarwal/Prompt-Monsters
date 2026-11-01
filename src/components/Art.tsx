import { useState } from "react";
import { manifest, type ArtId } from "./assetManifest";
import type { MonsterDefinition } from "../shared/types";
import { ASSETS } from "../shared/assets";

export type { ArtId } from "./assetManifest";

/** Viewports keep the owner's atlas pixels and filenames intact. */
export function AtlasArt({ id, className = "", label }: { id: ArtId; className?: string; label?: string }) {
  const region = manifest.regions[id];
  const [x, y, width, height] = region.rect;
  return <svg className={`atlas-art art-${id} ${className}`} viewBox={`${x} ${y} ${width} ${height}`} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
    <image href={manifest.sources[region.source as keyof typeof manifest.sources]} width={region.sheet[0]} height={region.sheet[1]} />
  </svg>;
}

export function CharacterArt({ id, src, label, className = "" }: { id: ArtId; src?: string; label: string; className?: string }) {
  const [missing, setMissing] = useState(false);
  if (manifest.preferIndividualSprites && src && !missing) return <img className={`character-art ${className}`} src={src} alt={label} onError={() => setMissing(true)} />;
  return <AtlasArt id={id} className={`character-art ${className}`} label={label} />;
}

export function MonsterArt({ monster, className = "" }: { monster: MonsterDefinition; className?: string }) {
  return <CharacterArt id={monster.id} src={monster.sprite} label={monster.name} className={`monster-art monster-${monster.id} ${className}`} />;
}

export function AbilityArt({ monster }: { monster: MonsterDefinition }) {
  return <CharacterArt id={monster.abilityName.toLowerCase().replaceAll(" ", "-") as ArtId} src={ASSETS.abilities[monster.id]} label={monster.abilityName} className="ability-art" />;
}

export function GuideArt() {
  const [missing, setMissing] = useState(false);
  return manifest.preferIndividualSprites && !missing ? <img className="guide-art" src={ASSETS.guide} alt="Meadow guide" onError={() => setMissing(true)} /> : <span className="guide-pixel" aria-label="Meadow guide, temporary pixel sprite"><i /><b /></span>;
}
