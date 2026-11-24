import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Database test files create and drop their own database in beforeAll/afterAll. On a busy machine the drop
    // retries while a background process lets go (tests/db/helpers.ts dropDatabase), which can pass the default
    // 10-second hook limit. Tests keep their own per-test timeouts.
    hookTimeout: 60_000,
  },
});
