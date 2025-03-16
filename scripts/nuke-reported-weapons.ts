import "dotenv/config";
import { db } from "~/db/sql";
import { currentSeason as _currentSeason } from "~/features/mmr/season";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";

const discordId = process.argv[2]?.trim();

invariant(discordId, "discord id is required (argument 1)");

async function main() {
	const currentSeason = _currentSeason(new Date());
	if (!currentSeason) {
		logger.info("No current season found");
		return;
	}

	const user = await db
		.selectFrom("User")
		.select(["User.id"])
		.where("User.discordId", "=", discordId)
		.executeTakeFirstOrThrow();

	const groupMatchMaps = await db
		.selectFrom("GroupMember")
		.innerJoin("Group", "Group.id", "GroupMember.groupId")
		.innerJoin("GroupMatch", (join) =>
			join.on((eb) =>
				eb.or([
					eb("GroupMatch.alphaGroupId", "=", eb.ref("Group.id")),
					eb("GroupMatch.bravoGroupId", "=", eb.ref("Group.id")),
				]),
			),
		)
		.innerJoin("GroupMatchMap", "GroupMatchMap.matchId", "GroupMatch.id")
		.select("GroupMatchMap.id")
		.where("GroupMatch.createdAt", ">", dateToDatabaseTimestamp(currentSeason.starts))
		.where("GroupMatch.createdAt", "<", dateToDatabaseTimestamp(currentSeason.ends))
		.where("GroupMember.userId", "=", user.id)
		.where("GroupMatchMap.winnerGroupId", "is not", null)
		.execute();

	const groupMatchMapIds = groupMatchMaps.map((gmm) => gmm.id);

	await db
		.deleteFrom("ReportedWeapon")
		.where("userId", "=", user.id)
		.where("ReportedWeapon.groupMatchMapId", "in", groupMatchMapIds)
		.execute();

	logger.info(`Deleted ${groupMatchMapIds.length} reported weapons for user ${discordId}`);
}

void main();
