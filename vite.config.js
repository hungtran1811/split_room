import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/firebase")) return "firebase";
          if (
            id.includes("node_modules/bootstrap") ||
            id.includes("node_modules/@popperjs")
          ) {
            return "bootstrap";
          }
        },
      },
    },
  },
});
