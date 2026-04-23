const { defineConfig } = require("vite");
const react = require("@vitejs/plugin-react").default;
const path = require("node:path");

module.exports = defineConfig({
  root: path.resolve(__dirname, "renderer"),
  base: "./",
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: path.resolve(__dirname, "renderer-dist"),
    emptyOutDir: true
  }
});
