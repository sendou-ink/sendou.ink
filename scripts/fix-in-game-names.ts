import "dotenv/config";
import { sql } from "~/db/sql";
import { IN_GAME_NAME_REGEXP } from "~/features/user-page/user-page-constants";
import { logger } from "~/utils/logger";

const users = sql
	.prepare('SELECT id, "inGameName" FROM "User" WHERE "inGameName" IS NOT NULL')
	.all() as { id: number; inGameName: string }[];

const invalidUsers = users.filter(
	(user) => !IN_GAME_NAME_REGEXP.test(user.inGameName),
);

logger.info("Invalid in-game names:");
for (const user of invalidUsers) {
	logger.info(`- ${user.inGameName} (id: ${user.id})`);
}

const updateStmt = sql.prepare(
	'UPDATE "User" SET "inGameName" = NULL WHERE id = @id',
);

for (const user of invalidUsers) {
	updateStmt.run({ id: user.id });
}

logger.info(
	`Fixed ${invalidUsers.length} invalid in-game names (out of ${users.length} total)`,
);
