import { db } from "~/db/sql";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";

const discordId = process.argv[2]?.trim();

invariant(discordId, "discord id is required (argument 1)");

await db
	.deleteFrom("Skill")
	.where("userId", "in", (eb) =>
		eb.selectFrom("User").select("User.id").where("discordId", "=", discordId),
	)
	.execute();

logger.info(`Deleted skill of user with discord id: ${discordId}`);
