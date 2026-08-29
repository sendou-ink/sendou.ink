import { db } from "~/db/sql";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { commonUserObjectFields, jsonBuildObject } from "~/utils/kysely.server";
import type { Unwrapped } from "~/utils/types";

export type ActiveMatchPlayersItem = Unwrapped<
	typeof findAllActiveMatchPlayers
>;
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
		.innerJoin("User", "User.id", "GroupMember.userId")
		.innerJoin("LiveStream", "LiveStream.twitch", "User.twitch")
		.select((eb) => [
			"GroupMatch.id as groupMatchId",
			"GroupMatch.createdAt as groupMatchCreatedAt",
			"LiveStream.twitch as streamTwitch",
			"LiveStream.viewerCount as streamViewerCount",
			"LiveStream.thumbnailUrl as streamThumbnailUrl",
			jsonBuildObject({
				...commonUserObjectFields(eb),
				twitch: eb.ref("User.twitch"),
			}).as("user"),
		])
		.where("Group.status", "=", "ACTIVE")
		.where("GroupMatch.createdAt", ">", dateToDatabaseTimestamp(oneHourAgo))
		.execute();
}
