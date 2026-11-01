import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { apiMiddleware } from "./server/api";

const apiPlugin = (): Plugin => ({
  name: "prompt-monsters-api",
  configureServer(server) {
    server.middlewares.use(apiMiddleware());
  },
});

export default defineConfig({
  plugins: [react(), apiPlugin()],
});
