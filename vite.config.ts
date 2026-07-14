import { defineConfig } from "vite";

// base './' so it works on GitHub Pages under any sub-path
export default defineConfig({
  base: "./",
  build: { target: "es2020" },
});
