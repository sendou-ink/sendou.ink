import { jsonObjectFrom } from "kysely/helpers/sqlite";
import { db } from "~/db/sql";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { COMMON_USER_FIELDS } from "~/utils/kysely.server";
import type { Unwrapped } from "~/utils/types";

export type ActiveMatchPlayersItem = Unwrapped<typeof activeMatchPlayers>;
export function activeMatchPlayers() {
	const oneHourAgo = new Date(Date.now() - 1000 * 60 * 60);

	return db
		.selectFrom("Group")
		.innerJoin("GroupMatch", (join) =>
			join.on((eb) =>
				eb.or([
					eb("GroupMatch.alphaGroupId", "=", eb.ref("Group.id")),
					eb("GroupMatch.bravoGroupId", "=", eb.ref("Group.id")),
				]),
			),
		)
		.innerJoin("GroupMember", "GroupMember.groupId", "Group.id")
		.select(({ eb }) => [
			"GroupMatch.id as groupMatchId",
			"GroupMatch.createdAt as groupMatchCreatedAt",
			jsonObjectFrom(
				eb
					.selectFrom("User")
					.select([...COMMON_USER_FIELDS, "User.twitch"])
					.whereRef("GroupMember.userId", "=", "User.id"),
			).as("user"),
		])
		.where("Group.status", "=", "ACTIVE")
		.where("GroupMatch.createdAt", ">", dateToDatabaseTimestamp(oneHourAgo))
		.execute();
}
