import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: { port: 5188, strictPort: true },
  build: {
    chunkSizeWarningLimit: 700,
    assetsInlineLimit: (file) => (/\.woff2?$/.test(file) ? false : undefined),
    rolldownOptions: {
      output: {
        advancedChunks: { groups: [{ name: "three", test: /node_modules[\\/]three/ }] },
      },
    },
  },
});
