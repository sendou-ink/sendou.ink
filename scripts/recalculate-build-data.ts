import "dotenv/config";
import * as BuildRepository from "~/features/builds/BuildRepository.server";
import { logger } from "~/utils/logger";

void main();

async function main() {
	await BuildRepository.recalculateAllTiers();
	logger.info("Recalculated all tiers");

	await BuildRepository.recalculateAllTop500();
	logger.info("Recalculated all top 500");
}
