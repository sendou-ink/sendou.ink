import type { SeedVariation } from "~/features/api-private/routes/seed";

const variation = process.argv[2] as SeedVariation;
const dbPath = process.argv[3];

if (!variation || !dbPath) {
	// biome-ignore lint/suspicious/noConsole: CLI script output
	console.error("Usage: seed-single-variation.ts <variation> <dbPath>");
	process.exit(1);
}

process.env.DB_PATH = dbPath;

const { seed } = await import("../app/db/seed/index");
await seed(variation === "DEFAULT" ? null : variation);
