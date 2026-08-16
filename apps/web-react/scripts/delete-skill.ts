import invariant from "@sendou/utils/invariant";
import { logger } from "@sendou/utils/logger";
import { db } from "~/db/sql";

const discordId = process.argv[2]?.trim();

invariant(discordId, "discord id is required (argument 1)");

await db
	.deleteFrom("Skill")
	.where("userId", "in", (eb) =>
		eb.selectFrom("User").select("User.id").where("discordId", "=", discordId),
	)
	.execute();

logger.info(`Deleted skill of user with discord id: ${discordId}`);
