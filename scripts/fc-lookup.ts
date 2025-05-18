import "dotenv/config";
import { db } from "~/db/sql";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";

const friendCode = process.argv[2]?.trim();

invariant(friendCode, "friend code is required (argument 1)");

async function main() {
	const allFcs = await db
		.selectFrom("UserFriendCode")
		.innerJoin("User", "User.id", "UserFriendCode.userId")
		.select([
			"UserFriendCode.friendCode",
			"User.id as userId",
			"User.discordId",
			"User.discordUniqueName",
		])
		.orderBy("UserFriendCode.createdAt", "asc")
		.whereRef("User.id", "=", "UserFriendCode.submitterUserId")
		.execute();

	const matches = allFcs.filter((fc) => fc.friendCode === friendCode);

	if (matches.length === 0) {
		logger.info("No matches found");
		return;
	}

	for (const match of matches) {
		logger.info(
			`${match.friendCode} - ${match.discordUniqueName} - ${match.discordId}`,
		);
	}
}

void main();
