import "dotenv/config";
import { sql } from "~/db/sql";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";

const discordId = process.argv[2]?.trim();

invariant(discordId, "discord id is required (argument 1)");

sql
	.prepare(
		'update "User" set plusSkippedForSeasonNth = null where discordId = @discordId',
	)
	.run({ discordId });

logger.info(`Plus Server admission unskipped for Discord ID: ${discordId}`);
