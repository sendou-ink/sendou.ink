import "dotenv/config";
import { db } from "~/db/sql";
import { databaseTimestampToDate } from "~/utils/dates";
import { logger } from "~/utils/logger";

async function main() {
	const allFcs = await db
		.selectFrom("UserFriendCode")
		.innerJoin("User", "User.id", "UserFriendCode.userId")
		.select(["UserFriendCode.friendCode", "User.id as userId"])
		.orderBy("UserFriendCode.createdAt", "asc")
		.whereRef("User.id", "=", "UserFriendCode.submitterUserId")
		.execute();

	const fcMap = new Map<string, number[]>();
	for (const fc of allFcs) {
		const fcs = fcMap.get(fc.friendCode) ?? [];
		fcs.push(fc.userId);
		fcMap.set(fc.friendCode, fcs);
	}

	const friendCodeAdders = await db
		.selectFrom("UserFriendCode")
		.innerJoin("User", "User.id", "UserFriendCode.userId")
		.select([
			"UserFriendCode.friendCode",
			"UserFriendCode.createdAt",
			"User.id",
			"User.discordId",
			"User.discordUniqueName",
		])
		.orderBy("UserFriendCode.createdAt", "desc")
		.whereRef("User.id", "=", "UserFriendCode.submitterUserId")
		.limit(90)
		.execute();

	let result = "";

	let date = "";
	for (const [i, friendCodeAdder] of friendCodeAdders.entries()) {
		const utc = databaseTimestampToDate(
			friendCodeAdder.createdAt,
		).toUTCString();
		const newDate = utc.split(",")[0];
		if (date !== newDate) {
			date = newDate;
			result += "\n";
		}

		const isDuplicate =
			(fcMap.get(friendCodeAdder.friendCode) ?? [])?.length > 1;

		result += `${i < 9 ? "0" : ""}${i + 1}) ${utc} - ${friendCodeAdder.friendCode}${isDuplicate ? " >>DUPLICATE<<" : ""} - ${friendCodeAdder.discordUniqueName} - ${friendCodeAdder.discordId}\n`;
	}

	logger.info(result);
}

void main();
