import "dotenv/config";
import { adminUserWidgets } from "~/db/seed";
import { logger } from "~/utils/logger";

adminUserWidgets();

logger.info("Admin user widgets seeded");
