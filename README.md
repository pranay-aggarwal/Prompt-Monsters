# Prompt Monsters

Prompt Monsters is a cute pixel-art browser RPG MVP. The project follows the module sequence and scope in `AGENTS.md`.

## Local Scripts

Install dependencies once:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Create a production build:

```bash
npm run build
```

## Module Status

Module 0 establishes the React + TypeScript + Vite + Tailwind foundation, shared navigation screen IDs, canonical monster contracts, and shared battle configuration. Later modules should import from `src/shared` rather than duplicating contracts.
