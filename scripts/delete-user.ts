import "dotenv/config";
import { sql } from "~/db/sql";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";

const discordId = process.argv[2]?.trim();

invariant(discordId, "discord id is required (argument 1)");

sql
	.prepare('delete from "User" where discordId = @discordId')
	.run({ discordId });

logger.info(`Deleted user with discord id: ${discordId}`);
