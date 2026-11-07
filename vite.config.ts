import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
// @ts-ignore
import { automationPlugin } from "./vite-automation-plugin.js";

export default defineConfig({
  plugins: [react(), viteSingleFile(), automationPlugin()],
});
