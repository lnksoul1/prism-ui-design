import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/v2/",
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:3100", changeOrigin: true },
      "/ws": { target: "ws://localhost:3100", ws: true },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
  },
});
