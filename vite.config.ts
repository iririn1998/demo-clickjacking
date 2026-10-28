import { defineConfig } from "vitest/config";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import { demoServerPlugin } from "./server/demo-server.ts";

// https://vite.dev/config/
export default defineConfig({
  plugins: [demoServerPlugin(), react(), babel({ presets: [reactCompilerPreset()] })],
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true },
  test: {
    environment: "happy-dom",
    globals: true,
  },
});
