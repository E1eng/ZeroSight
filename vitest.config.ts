import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const { default: tsconfigPaths } = await import("vite-tsconfig-paths");

  return {
    plugins: [tsconfigPaths()],
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: ["./vitest.setup.ts"],
      include: ["**/__tests__/**/*.test.{ts,tsx}", "**/__tests__/**/*.spec.{ts,tsx}"],
      coverage: {
        reporter: ["text", "lcov"],
        reportsDirectory: "coverage"
      }
    }
  };
});
