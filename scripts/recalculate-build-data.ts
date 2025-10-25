import "dotenv/config";
import { db } from "~/db/sql";
import * as BuildRepository from "~/features/builds/BuildRepository.server";
import { logger } from "~/utils/logger";

void main();

async function main() {
	await BuildRepository.recalculateAllTiers();
	logger.info("Recalculated all tiers");

	await BuildRepository.recalculateAllTop500();
	logger.info("Recalculated all top 500");

	await db
		.updateTable("BuildWeapon")
		.set({
			updatedAt: (eb) =>
				eb
					.selectFrom("Build")
					.select("Build.updatedAt")
					.whereRef("Build.id", "=", "BuildWeapon.buildId"),
		})
		.execute();
	logger.info("Recalculated BuildWeapon updatedAt");
}
