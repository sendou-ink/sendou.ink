import "dotenv/config";
import { sql } from "~/db/sql";
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

const stm = sql.prepare(
	/* sql */ `insert into "TournamentBadgeOwner" ("badgeId", "userId") values (@badgeId, (select "id" from "User" where "discordId" = @userId))`,
);

const userStm = sql.prepare(
	/* sql */ `select "id" from "User" where "discordId" = @discordId`,
);

const users = discordIds.split(",");

for (const userId of users) {
	const user = userStm.get({ discordId: userId });
	if (!user) {
		logger.info(`User with discord id ${userId} not found`);
		continue;
	}
	stm.run({ badgeId: Number(badgeId), userId });
}

logger.info(`Added ${users.length} owners to the badge`);
