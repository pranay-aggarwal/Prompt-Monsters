# Prompt Monsters

Prompt Monsters is a prompt-driven pixel RPG. Explore Prompt Meadow, build a team of three, and challenge Kween by instructing your active monster.

## Run Locally

```bash
npm install
npm run dev
npm run build
```

Add provider settings to the root `.env` file. One OpenAI key can power both monster responses and neutral judging. Exa research is optional.

```env
AI_PROVIDER=openai
OPENAI_API_KEY=
OPENAI_MODEL=
OPENAI_JUDGE_MODEL=
EXA_API_KEY=
```

When no provider is configured, the battle remains playable in Offline Practice Mode.

## Replaceable PNG Sprites

Copy supplied sprites into `public/assets/` using these paths. The UI has bounded image slots and temporary placeholders until each PNG is present.

```text
characters/monsters/{soli,astra,giptoo,sori,coddy}/idle.png
characters/bosses/kween/idle.png
characters/player/{front,back,left,right}.png
characters/npc/meadow-guide.png
backgrounds/{meadow-background,kween-arena}.png
```

Monster sprite paths are defined in `src/shared/monsters.ts`. Player, guide, and boss paths are defined in `src/shared/assets.ts`.
