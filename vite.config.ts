import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 0,
    host,
    portFile: "../src-tauri/.tauri/dev/port",
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
