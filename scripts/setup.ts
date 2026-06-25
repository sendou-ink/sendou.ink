import { seed } from "~/db/seed";
import { db } from "~/db/sql";
import { logger } from "~/utils/logger";
import { seedImages } from "./seed-images";

async function main() {
	const dbEmpty = !(await db.selectFrom("User").selectAll().executeTakeFirst());

	// Run migration and seed if db.sqlite3 doesn't exist
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

	// Seed images to Minio
	logger.info("🖼️  Seeding images to Minio...");
	try {
		await seedImages();
	} catch (err) {
		logger.error("Error seeding images:", (err as Error).message);
	}
}

main();
