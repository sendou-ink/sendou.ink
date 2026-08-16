import type { Unwrapped } from "@sendou/utils/types";
import { db } from "#lib/server/db/sql.ts";
import { commonUserSelect, jsonObjectFrom } from "#lib/server/kysely.ts";
import { dateToDatabaseTimestamp } from "#lib/utils/dates.ts";

export type ActiveMatchPlayersItem = Unwrapped<
	typeof findAllActiveMatchPlayers
>;

/** Players of recently created SendouQ matches that are currently live on Twitch. */
export function findAllActiveMatchPlayers() {
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
		.innerJoin("LiveStream", "LiveStream.userId", "GroupMember.userId")
		.select(({ eb }) => [
			"GroupMatch.id as groupMatchId",
			"GroupMatch.createdAt as groupMatchCreatedAt",
			"LiveStream.twitch as streamTwitch",
			"LiveStream.viewerCount as streamViewerCount",
			"LiveStream.thumbnailUrl as streamThumbnailUrl",
			jsonObjectFrom(
				eb
					.selectFrom("User")
					.select((eb) => [...commonUserSelect(eb), "User.twitch"])
					.whereRef("GroupMember.userId", "=", "User.id"),
			).as("user"),
		])
		.where("Group.status", "=", "ACTIVE")
		.where("GroupMatch.createdAt", ">", dateToDatabaseTimestamp(oneHourAgo))
		.execute();
}
