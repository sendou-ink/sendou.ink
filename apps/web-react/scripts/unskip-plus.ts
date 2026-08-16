import { db } from "~/db/sql";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";

const discordId = process.argv[2]?.trim();

invariant(discordId, "discord id is required (argument 1)");

await db
	.updateTable("User")
	.set({ plusSkippedForSeasonNth: null })
	.where("discordId", "=", discordId)
	.execute();

logger.info(`Plus Server admission unskipped for Discord ID: ${discordId}`);
