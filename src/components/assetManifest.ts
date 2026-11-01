import type suppliedManifest from "../../public/assets/asset-manifest.json";
import { ASSETS } from "../shared/assets";

export type AssetManifest = typeof suppliedManifest;
export type ArtId = keyof AssetManifest["regions"];
export let manifest: AssetManifest;
export function arenaBackground() { return manifest.preferIndividualSprites ? ASSETS.arena : manifest.sources.arena; }

export async function loadAssetManifest() {
  const response = await fetch("/assets/asset-manifest.json");
  if (!response.ok) throw new Error("The asset manifest could not load.");
  const data = await response.json() as AssetManifest;
  if (data.version !== 1 || typeof data.preferIndividualSprites !== "boolean" || !data.sources || !data.regions) throw new Error("Invalid asset manifest.");
  if (!Object.values(data.sources).every(path => typeof path === "string" && path.startsWith("/assets/"))) throw new Error("Assets must use local /assets/ paths.");
  for (const region of Object.values(data.regions)) {
    if (!(region.source in data.sources) || !Array.isArray(region.rect) || region.rect.length !== 4 || !Array.isArray(region.sheet) || region.sheet.length !== 2 || ![...region.rect, ...region.sheet].every(n => Number.isFinite(n) && n >= 0)) throw new Error("Invalid atlas viewport.");
  }
  manifest = data;
}
