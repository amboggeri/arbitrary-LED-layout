import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["packages/*", "apps/*"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**", "apps/bridge/src/**", "apps/studio/src/**"],
      exclude: ["**/*.d.ts", "**/index.ts", "apps/studio/src/main.tsx"],
      reporter: ["text-summary", "html"],
    },
  },
});
