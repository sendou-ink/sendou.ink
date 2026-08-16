import { db } from "~/db/sql";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";

const badgeId = process.argv[2]?.trim();
const discordIds = process.argv[3]?.trim();

invariant(discordIds, "id list of discord ids required (argument 1)");
invariant(badgeId, "display name of badge is required (argument 2)");
invariant(
	discordIds.includes(","),
	"discordIds must be a comma separated list of discord ids",
);

const users = discordIds.split(",");

for (const discordId of users) {
	const user = await db
		.selectFrom("User")
		.select("id")
		.where("discordId", "=", discordId)
		.executeTakeFirst();

	if (!user) {
		logger.info(`User with discord id ${discordId} not found`);
		continue;
	}

	await db
		.insertInto("TournamentBadgeOwner")
		.values({ badgeId: Number(badgeId), userId: user.id })
		.execute();
}

logger.info(`Added ${users.length} owners to the badge`);
