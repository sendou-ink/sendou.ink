import "dotenv/config";
import fs from "node:fs";
import { seed } from "~/db/seed";
import { db } from "~/db/sql";
import { logger } from "~/utils/logger";

async function main() {
	// Step 1: Create .env if it doesn't exist
	if (!fs.existsSync(".env")) {
		logger.info("📄 .env not found. Creating from .env.example...");
		fs.copyFileSync(".env.example", ".env");
		logger.info(".env created with defaults values");
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
}

main();
