import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // integration tests run ffmpeg, S3 and Postgres: 0.5 s alone, but over 5 s (the default) on a busy laptop (Task 1.33)
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // `pnpm build` compiles the tests into dist/; without this they would run twice
    exclude: [...configDefaults.exclude, "dist/**"],
  },
});
