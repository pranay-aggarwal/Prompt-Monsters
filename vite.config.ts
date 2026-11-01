import { defineConfig, loadEnv } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { apiMiddleware } from "./server/api";

const apiPlugin = (): Plugin => ({
  name: "prompt-monsters-api",
  configureServer(server) {
    server.middlewares.use(apiMiddleware());
  },
  configurePreviewServer(server) {
    server.middlewares.use(apiMiddleware());
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  for (const key of ["AI_PROVIDER", "OPENAI_API_KEY", "OPENAI_MODEL", "OPENAI_JUDGE_MODEL", "CEREBRAS_API_KEY", "CEREBRAS_MODEL", "CEREBRAS_JUDGE_MODEL", "EXA_API_KEY"]) {
    if (process.env[key] === undefined && env[key] !== undefined) process.env[key] = env[key];
  }
  return { plugins: [react(), apiPlugin()] };
});
