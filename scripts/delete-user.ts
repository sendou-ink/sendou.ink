import "dotenv/config";
import { sql } from "~/db/sql";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";

const discordId = process.argv[2]?.trim();

invariant(discordId, "discord id is required (argument 1)");

const user = sql
	.prepare('select id from "User" where discordId = @discordId')
	.get({ discordId }) as { id: number } | undefined;

invariant(user, `user with discord id ${discordId} not found`);

const userId = user.id;

sql.prepare('delete from "Build" where ownerId = @userId').run({ userId });
sql.prepare('delete from "UserWeapon" where userId = @userId').run({ userId });
sql.prepare('delete from "User" where id = @userId').run({ userId });

logger.info(`Deleted user with discord id: ${discordId}`);
