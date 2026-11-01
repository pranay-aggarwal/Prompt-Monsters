# Final asset exports

The five supplied images are integrated, unchanged, in `public/assets/source/`. Their original filenames are preserved. `public/assets/asset-manifest.json` defines the atlas viewports. No image generation was used for this integration.

The game is playable with these sources. The remaining artwork work is clean exports and one guide sprite, not new monster designs. The player sheet has an opaque checkerboard; several atlas cells also include parts of neighbouring artwork. These should be corrected in final exports. Until then, the game displays the supplied art through bounded viewports and uses a temporary CSS pixel guide.

Use one prompt at a time with the named reference image attached. Keep the reference designs. Do not generate a new cast, copy Pokémon assets, or use product logos. Ask for **real alpha transparency**, never a painted checkerboard. Validate the exported file over both light and dark backgrounds.

## Six character cutouts

Reference: `Assets/ChatGPT Image Nov 1, 2026, 02_34_33 PM.png`.

Use this shared instruction, followed by exactly one character instruction below:

> Extract only the specified original character from the attached approved artwork. Preserve its exact silhouette, facial features, proportions, costume, colours, tiny accessories, pixel texture, and lighting. Remove the backdrop and all neighbouring characters. This is a faithful clean export, not a redesign. Show the complete character, centred with 10% clear padding, on a genuinely transparent RGBA canvas. Crisp 16-bit RPG pixel art, matching the reference's pixel scale. No added text, labels, shadows outside the character, checkerboard, watermark, or logos. Deliver one static idle sprite, preferably 512×512 with consistent framing across the six exports.

| Character instruction | Save as |
| --- | --- |
| **Soli, upper left:** tiny golden sun spirit with stubby feet, peach cheeks, expressive eyes, orange curved sound-wave rays. Preserve all rays. | `public/assets/characters/monsters/soli/idle.png` |
| **Astra, upper centre:** midnight-purple cosmic cat with starry ears, golden eyes, forehead constellation, and orbiting star on its tail. Preserve the entire tail and star. | `public/assets/characters/monsters/astra/idle.png` |
| **Giptoo, upper right:** sky-blue rounded retro CRT creature with two antennae, little feet, cheerful screen face, and visible number 2 on its forehead. | `public/assets/characters/monsters/giptoo/idle.png` |
| **Sori, lower left:** white cloud-bunny with lavender shading, rosy cheeks, and cinematic-frame ribbon tail. Preserve the entire ribbon and small surrounding clouds that belong to Sori. | `public/assets/characters/monsters/sori/idle.png` |
| **Coddy, lower centre:** mint-green beetle-gecko with terminal belly showing `</>`, antennae, tiny wrench tool, and wrench-shaped tail. Preserve both tool and tail. | `public/assets/characters/monsters/coddy/idle.png` |
| **Kween, lower right:** violet, indigo, and icy-blue royal fox-cat with oversized geometric crown, restrained gold trim, cape, and floating score tiles. Preserve crown, ears, cape, and tiles. | `public/assets/characters/bosses/kween/idle.png` |

## Player directional exports

Reference: `Assets/ChatGPT Image Nov 1, 2026, 02_33_54 PM.png`.

> Make a faithful clean export of the centre idle frame from row [ROW] in the attached approved player sheet. Preserve the exact brown hair, red scarf, cream shirt, brown clothing, boots, teal satchel, outline, pose, lighting, and pixel scale. Remove the baked-in grey-and-white checkerboard and every neighbouring frame. Full character visible with feet on a common baseline; centred on a genuinely transparent 128×160 RGBA canvas with clear padding. No redesign, no extra frames, no checkerboard, no text, no floor or shadow. Match framing and scale to the other three directions.

| Row | Facing | Save as |
| --- | --- | --- |
| 1 | Front / down | `public/assets/characters/player/front.png` |
| 2 | Left | `public/assets/characters/player/left.png` |
| 3 | Right | `public/assets/characters/player/right.png` |
| 4 | Back / up | `public/assets/characters/player/back.png` |

## Meadow guide — the one new sprite needed

Attach the player sheet as a **style and scale reference**, and the environment sheet as a **palette reference**. The guide should be distinct from the player.

> One friendly non-player meadow guide for an original 16-bit top-down browser RPG. Small chibi proportions matching the attached player, facing down. Warm face, small cream brimmed hat, muted sage-green field coat, brown boots, a tiny field notebook. Calm, welcoming expression. Consistent dark outline, upper-left light, restrained meadow palette, readable at 40 pixels tall. One static full-body sprite centred on a genuinely transparent 128×160 RGBA canvas. No backdrop, no ground, no checkerboard, no text, no logos, no additional characters. This is a single meadow NPC, not another collectible monster.

Save as `public/assets/characters/npc/meadow-guide.png`.

## Already supplied — reuse

- Meadow grass, path, trees, pond, rocks, signs, flowers, mushroom: `02_35_02 PM.png`. No new environment pack is needed.
- All five ability icons and heal, impact, shield, shield-break, decoy, sparkle: `02_35_13 PM.png`. No new effects are needed.
- Kween arena: `02_39_00 PM.png`. No replacement arena is needed. For individual-pack mode copy this unchanged to `public/assets/backgrounds/kween-arena.png`.

The meadow is rendered from tiles so its displayed obstacles agree with collision. A new flat meadow background is unnecessary and must not replace the tile layout independently.

## Integrate the final exports

1. Place character PNGs at the exact paths above. Keep the source sheets.
2. Set `preferIndividualSprites` to `true` in `public/assets/asset-manifest.json`. Missing character/ability PNGs fall back to the supplied atlas or the temporary guide.
3. Optional individual ability icons use `public/assets/icons/abilities/{soli-echo-cheer,astra-galaxy-brain,giptoo-pattern-echo,sori-scene-shift,coddy-patch-pounce}.png`. The atlas still supplies icons if these are absent.
4. Run `npm run build`, `npm test`, and, with the dev server running, `npm run test:browser`.
5. Inspect all characters over the meadow, collection cards, and dark arena. Ensure the number 2 and `</>` remain legible; no tails, crowns, or feet are cut off.
