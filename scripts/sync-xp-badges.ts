import "dotenv/config";
import * as BadgeRepository from "~/features/badges/BadgeRepository.server";
import { logger } from "~/utils/logger";

void (async () => {
	await BadgeRepository.syncXPBadges();
	logger.info("Synced XP badges");
})();
