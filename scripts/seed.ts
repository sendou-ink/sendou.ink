import { seed } from "~/db/seed";

const startedAt = Date.now();

await seed();

// eslint-disable-next-line no-console -- CLI script output
console.log(`Seeded in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
