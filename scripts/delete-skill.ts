import "dotenv/config";
import { sql } from "~/db/sql";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";

const discordId = process.argv[2]?.trim();

invariant(discordId, "discord id is required (argument 1)");

sql
	.prepare(
		'delete from "Skill" where "userId" = (select id from "User" where discordId = @discordId)',
	)
	.run({ discordId });

logger.info(`Deleted skill of user with discord id: ${discordId}`);
