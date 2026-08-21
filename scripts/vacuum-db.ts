import { ServerConfig } from "~/config.server";
import { VacuumDatabaseRoutine } from "~/routines/vacuumDatabase";
import { logger } from "~/utils/logger";

logger.info(
	`Vacuuming ${ServerConfig.dbPath}, writes are blocked until it finishes`,
);

await VacuumDatabaseRoutine.run();
