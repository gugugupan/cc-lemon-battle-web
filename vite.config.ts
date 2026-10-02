import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: { port: 5188, strictPort: true },
  build: {
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        advancedChunks: { groups: [{ name: "three", test: /node_modules[\\/]three/ }] },
      },
    },
  },
});
