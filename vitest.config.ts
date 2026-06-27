import path from "node:path";
import { defineConfig, configDefaults } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/test/setup.ts"],
    fileParallelism: false,
    // next build(standalone)가 소스·테스트를 .next/standalone로 복사하므로 제외.
    exclude: [...configDefaults.exclude, "**/.next/**"]
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src")
    }
  }
});
