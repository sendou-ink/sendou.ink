import { installSeedClock } from "~/db/seed/core/frozen-clock";

// installed before the seed modules load so even module-scope dates are frozen
installSeedClock();

const startedAt = performance.now();

const { seed } = await import("~/db/seed");
await seed();

// biome-ignore lint/suspicious/noConsole: CLI script output
console.log(
	`Seeded in ${((performance.now() - startedAt) / 1000).toFixed(1)}s`,
);
