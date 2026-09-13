import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Standalone CLI scripts that run their side effects at import time
      // (hit the network, mutate the DB) rather than exporting testable
      // logic — not worth the invasive rewrite it'd take to unit test.
      exclude: ["src/seed.ts", "src/snapRoutes.ts", "src/backfill.ts", "src/env.ts", "src/supabase.ts"],
    },
  },
});
