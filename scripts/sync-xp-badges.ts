import "dotenv/config";
import { syncXPBadges } from "~/features/badges/queries/syncXPBadges.server";
import { logger } from "~/utils/logger";

syncXPBadges();

logger.info("Synced XP badges");
