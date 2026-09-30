import { seed } from "~/db/seed";

const startedAt = Date.now();

await seed();

// biome-ignore lint/suspicious/noConsole: CLI script output
console.log(`Seeded in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
