# Prompt Monsters

A small pixel-art RPG about asking better questions. Explore Prompt Meadow, choose three original monsters, and challenge Kween's claims with your own instructions.

## Run locally

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite. No API keys are needed to finish the game in **Offline Practice Mode**.

To serve a built version with the same server-side API middleware:

```bash
npm run build
npm run preview
```

Both local commands load server configuration from `.env`. A static host serving only `dist/` supports offline play; live turns require the API middleware or an equivalent server route. Vite preview is for local demo checks, not a production hosting service.

## Play the demo

1. Start your adventure. Five monsters appear at random reachable positions in the meadow. Move with **WASD**, **arrow keys**, the on-screen direction buttons, or click the ground to walk there.
2. Find the guide. Press **E** or **Enter** next to them to talk; press again to continue. **Escape** closes dialogue.
3. Find monsters on the map. Click a monster to walk over, or walk next to it and press **E**. Choose **Collect** in the encounter. It leaves the map and joins your collection. You can leave an encounter and return later; collection is guaranteed and uses no AI calls.
4. After collecting at least three, visit the Party Shrine or open **My party**. Choose exactly three from the monsters you've collected. Undiscovered monsters cannot be selected. Cards toggle selection; the large portrait explains the focused companion's strengths. You can keep exploring until you've collected all five.
5. Choose one of Kween's three authored challenges, then enter the arena. You can also return to the meadow and enter through Kween's Gate after selecting a team.
6. Choose a living active companion and write an instruction about Kween's claim. Try: “Astra, identify an assumption in Kween's claim. Explain when it holds and give one testable counterexample.”
7. To combine abilities, open **Team up & research**, choose a helper, and ask that teammate to collaborate in the prompt. Naming one available helper directly in the prompt also works.
8. Send the prompt, or use **Ctrl/⌘ + Enter**. Read the response and one improvement suggestion. The rubric and the full battle journal are available below the arena.
9. Defeat Kween, collect the badge, and return to the meadow or retry. Defeated active companions automatically yield to a living teammate.

Every valid argument deals engine-computed damage; signature abilities add their canonical effects. Research is optional. Practice responses are authored examples and practice scores use a transparent heuristic, not genuine AI assessment or fact checking.

## Live AI and research

Copy `.env.example` to `.env` if needed, then fill only the selected provider's server-side settings:

```env
AI_PROVIDER=openai
OPENAI_API_KEY=
OPENAI_MODEL=
OPENAI_JUDGE_MODEL=
EXA_API_KEY=
```

For Cerebras, set `AI_PROVIDER=cerebras`, `CEREBRAS_API_KEY`, and `CEREBRAS_MODEL`; `CEREBRAS_JUDGE_MODEL` is optional. One selected provider serves all monsters, with a separate neutral judge request. An absent judge model uses the main configured model. Restart the dev server after changing environment settings. Never use a `VITE_` variable for a secret.

Each battle allows at most four live turns (eight model requests), one Exa search, and three search results. No ordinary movement, dialogue, team selection, or result screen uses AI. Research requires an explicit request or the research toggle; “don't research” does not initiate a search. Provider failure falls back to practice. If only the judge fails, a validated monster response is retained and its score is clearly provisional.

## Assets and source layout

Original supplied artwork is preserved under `Assets/` and copied, with unchanged filenames, into `public/assets/source/`. The asset manifest defines display viewports. This build uses the original monster art, player frames, scenery, effects, and arena. The guide is a replaceable temporary pixel sprite.

**[Final export prompts and exact paths](docs/ASSET_PROMPTS.md)** cover clean transparent character/player exports and the one missing guide sprite. The current player sheet has a baked-in checkerboard, and some character cells include neighbouring pixels. These are source-art limitations, not blockers for play.

- `src/game/battle.ts`: pure battle rules, scoring, action validation, offline templates, and turn history.
- `src/game/meadow.ts`: shared visual/collision coordinates, random spawns, encounter/collection rules, click-to-walk routes, and authored guide dialogue.
- `src/components/`: artwork viewports and game screens.
- `src/shared/`: canonical monster profiles, scenarios, types, rules, and shared input validation.
- `server/api.ts`: selected-provider response, neutral judge, bounded Exa search, and output validation.

Shared files changed during integration to centralise scoring weights, retain safe responses when judging fails, and use one validation rule on client and server. Canonical names, designs, HP, damage bands, abilities, and boss pattern are preserved.

## Checks

```bash
npm test
npm run build
# In another terminal, with npm run dev running:
npm run test:browser
```

The dependency-free test runner uses Vite's installed TypeScript loader. It checks abilities, scoring, combos, atomic invalid actions, all 30 team/scenario combinations, defeat/retry, map reachability, and mocked provider/research routes and caps. It makes no live calls and never reads your `.env`.

Browser checks use installed Google Chrome through its native DevTools protocol, with an isolated temporary profile. They require no browser download or extra package. Set `CHROME_BIN` to another Chrome/Chromium binary if needed, and `GAME_URL` if using another port. Browser tests bypass live calls. Screenshots go to ignored `artifacts/qa/`.

The owner/team must still play the demo and check live services in the intended environment before marking the final AGENTS.md acceptance checklist complete.
