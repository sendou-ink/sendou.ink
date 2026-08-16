import invariant from "@sendou/utils/invariant";
import { logger } from "@sendou/utils/logger";
import { db } from "~/db/sql";

const discordId = process.argv[2]?.trim();

invariant(discordId, "discord id is required (argument 1)");

const user = await db
	.selectFrom("User")
	.select("id")
	.where("discordId", "=", discordId)
	.executeTakeFirst();

invariant(user, `user with discord id ${discordId} not found`);

const userId = user.id;

await db.deleteFrom("Build").where("ownerId", "=", userId).execute();
await db.deleteFrom("UserWeapon").where("userId", "=", userId).execute();
await db.deleteFrom("User").where("id", "=", userId).execute();

logger.info(`Deleted user with discord id: ${discordId}`);
