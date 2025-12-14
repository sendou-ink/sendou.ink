import "dotenv/config";
import fs from "node:fs";
import { seed } from "~/db/seed";
import { db } from "~/db/sql";
import { logger } from "~/utils/logger";
import { seedImages } from "./seed-images";

async function main() {
	// Step 1: Create .env if it doesn't exist
	if (!fs.existsSync(".env")) {
		logger.info("📄 .env not found. Creating from .env.example...");
		const envContent = fs.readFileSync(".env.example", "utf-8");
		const filteredEnv = envContent
			.split("\n")
			.filter((line) => !line.trim().startsWith("//")) // remove comments to prevent issues with Docker
			.join("\n");
		fs.writeFileSync(".env", filteredEnv);
		logger.info(".env created with default values");
	}

	const dbEmpty = !(await db.selectFrom("User").selectAll().executeTakeFirst());

	// Step 2: Run migration and seed if db.sqlite3 doesn't exist
	if (dbEmpty) {
		logger.info("🌱 Seeding database...");
		try {
			await seed();
			logger.info("Database seeded successfully");
		} catch (err) {
			logger.error(
				"Error running migrate or seed scripts:",
				(err as Error).message,
			);
			process.exit(1);
		}
	}

	// Step 3: Seed images to Minio
	logger.info("🖼️  Seeding images to Minio...");
	try {
		await seedImages();
	} catch (err) {
		logger.error("Error seeding images:", (err as Error).message);
	}
}

main();
