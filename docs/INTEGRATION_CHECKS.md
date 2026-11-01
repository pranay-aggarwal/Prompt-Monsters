# MVP integration handoff

Branch: `feature/mvp-integration`. No commits or merges were made. AGENTS.md remains the product authority.

## Implemented

- Existing React/TypeScript/Vite app retained; no project dependencies added.
- Original supplied artwork integrated through one replaceable asset manifest, without rewriting or renaming source art.
- Illustrated title, tile-based meadow, visible landmarks, guide dialogue, quest hints, on-screen controls, and party access. The map fits the viewport, with separate ground/scenery/monster/player layers and movement controls outside the map.
- Per the owner's updated flow, five canonical monsters spawn at random reachable positions each adventure. Approach on foot or click to walk over, encounter, collect, then choose a team. Uncollected monsters cannot be selected; collecting a monster removes it from the map and never automatically chooses a party.
- Five-monster selection, large companion preview, ability explanations, exactly-three enforcement, and three challenge choices.
- Arena scene, active-monster switching, HP/shield feedback, compact free-form composer, explicit helper requests, optional research, turn feedback, rubric disclosure, full journal, victory badge, and retry.
- Shared deterministic engine, independent score recomputation, strict action validation, automatic switch after defeat, and safe offline fallback.
- Provider integration rejects extra output fields and malformed predictions. Judge failure retains a validated monster response with clearly provisional local scores. Ordinary and negated research requests do not trigger a search.
- Built preview supports the same local API route as dev mode.

## Verification

`npm test`: 26 checks passed, including all 30 combinations of three-monster team and authored challenge. Exploration checks cover 250 random layouts, unique/reachable spawn positions clear of landmarks and paths, nearby-only collection, duplicate protection, removal from the map, and collection-gated party selection. Other checks cover all five abilities, three synergies, score weighting/bands, shield-first damage, atomic action rejection, helper restrictions, map reachability/collision, defeated-active switching, and defeat/retry from a low-HP fixture. Provider calls are mocked for OpenAI/Cerebras, research intent/results/caps, four-turn allowance, malformed output, judge failure, and missing configuration. No live credentials are used by the tests.

`npm run test:browser`: Chrome completed title → meadow → guide dialogue → random encounter → collect all five → choose three → battle → feedback → victory → retry. Checked empty-collection selection rejection, declining and revisiting an encounter, automatic click-to-walk, removal after collection, collection persistence across screens, new-adventure reset with a different layout, boundary collision, exactly-three enforcement, invalid prompt/helper hints, an Astra/Coddy combo, rubric disclosure, and missing assets/page errors. The player and map fit 1440×900, 1280×720, 390×844, and 320×568 viewports. Browser tests explicitly bypass live service calls. Screenshots are in ignored `artifacts/qa/`.

`npm run build`: TypeScript project checks and production bundling passed.

One separately authorised real turn was attempted against the locally configured OpenAI route, without research. It returned HTTP 503 and the expected offline fallback response. A successful live monster/judge pair is **not verified** in this environment. The response did not expose credentials.

Exa is not configured locally. Successful real research is **not verified**; mocked research, result rendering, and caps are checked.

## Remaining acceptance items

- Complete an unaided playthrough by the owner or another teammate.
- Verify a successful real provider turn with valid account/model access and available service.
- Configure Exa if research is desired, then verify one real research turn.
- Replace the temporary guide and export clean individual player/character PNGs using `ASSET_PROMPTS.md`. The supplied player has a baked-in checkerboard, and a few atlas cells contain neighbouring pixels.

These items are not marked complete in AGENTS.md. The offline game remains playable. No new bosses, regions, accounts, multiplayer, or other scope was introduced.
