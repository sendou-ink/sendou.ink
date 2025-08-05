import { db } from '$lib/server/db/sql';
import { logger } from '$lib/utils/logger';
import 'dotenv/config';
import fs from 'node:fs';

async function main() {
	// Step 1: Create .env if it doesn't exist
	if (!fs.existsSync('.env')) {
		logger.info('📄 .env not found. Creating from .env.example...');
		const envContent = fs.readFileSync('.env.example', 'utf-8');
		const filteredEnv = envContent
			.split('\n')
			.filter((line) => !line.trim().startsWith('//')) // remove comments to prevent issues with Docker
			.join('\n');
		fs.writeFileSync('.env', filteredEnv);
		logger.info('.env created with default values');
	}

	const dbEmpty = !(await db.selectFrom('User').selectAll().executeTakeFirst());

	// Step 2: Run migration and seed if db.sqlite3 doesn't exist
	if (dbEmpty) {
		// logger.info("🌱 Seeding database...");
		logger.info('Seeding database is not implemented yet, skipping...');
		// try {
		// 	// await seed();
		// 	logger.info("Database seeded successfully");
		// } catch (err) {
		// 	logger.error(
		// 		"Error running migrate or seed scripts:",
		// 		(err as Error).message,
		// 	);
		// 	process.exit(1);
		// }
	}
}

main();
