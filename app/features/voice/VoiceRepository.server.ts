import { sql } from "kysely";
import { db } from "~/db/sql";
import type { Tables, TablesInsertable } from "~/db/tables";
import { actorId } from "~/features/auth/core/user.server";
import { databaseTimestampNow } from "~/utils/dates";
import { commonUserJsonObject } from "~/utils/kysely.server";
import { toDBBoolean } from "~/utils/sql";
import {
	VOICE_FEATURES,
	VOICE_TOKEN_LIFETIME_MINUTES,
	type VoiceFeature,
	type VoiceLeaveReason,
} from "./voice-constants";

const MAX_SESSION_SECONDS = VOICE_TOKEN_LIFETIME_MINUTES * 60;

const KILL_SWITCH_COLUMN_BY_FEATURE = {
	SENDOUQ: "isSendouQDisabled",
	LOBBIES: "isLobbiesDisabled",
	TOURNAMENTS: "isTournamentsDisabled",
	LFG: "isLfgDisabled",
} as const satisfies Record<VoiceFeature, keyof Tables["VoiceSettings"]>;

const participantSeconds = () =>
	sql<number>`coalesce(sum(coalesce(
		"VoiceSession"."durationSeconds",
		min(coalesce("VoiceSession"."leftAt", ${databaseTimestampNow()}) - "VoiceSession"."connectedAt", ${MAX_SESSION_SECONDS})
	)), 0)`;

const LATEST_ERRORS_LIMIT = 50;
const LATEST_FEEDBACK_LIMIT = 30;

export async function findSettings() {
	const row = await db
		.selectFrom("VoiceSettings")
		.selectAll()
		.orderBy("VoiceSettings.id", "asc")
		.executeTakeFirst();

	return {
		isDisabled: Boolean(row?.isDisabled),
		disabledFeatures: VOICE_FEATURES.filter((feature) =>
			Boolean(row?.[KILL_SWITCH_COLUMN_BY_FEATURE[feature]]),
		),
		updatedAt: row?.updatedAt ?? null,
	};
}

export async function sumParticipantMinutesSince(since: number) {
	const row = await db
		.selectFrom("VoiceSession")
		.select(sql<number>`${participantSeconds()} / 60.0`.as("minutes"))
		.where("VoiceSession.connectedAt", "is not", null)
		.where("VoiceSession.createdAt", ">=", since)
		.executeTakeFirstOrThrow();

	return row.minutes;
}

export async function sumParticipantMinutesByFeatureSince(
	since: number,
): Promise<Record<VoiceFeature, number>> {
	const rows = await db
		.selectFrom("VoiceSession")
		.select([
			"VoiceSession.feature",
			sql<number>`${participantSeconds()} / 60.0`.as("minutes"),
		])
		.where("VoiceSession.connectedAt", "is not", null)
		.where("VoiceSession.createdAt", ">=", since)
		.groupBy("VoiceSession.feature")
		.execute();

	const minutesByFeature: Record<VoiceFeature, number> = {
		SENDOUQ: 0,
		LOBBIES: 0,
		TOURNAMENTS: 0,
		LFG: 0,
	};
	for (const row of rows) {
		minutesByFeature[row.feature] += row.minutes;
	}

	return minutesByFeature;
}

export async function hasFeedbackSince({
	userId,
	since,
}: {
	userId: number;
	since: number;
}) {
	const row = await db
		.selectFrom("VoiceFeedback")
		.select("VoiceFeedback.id")
		.where("VoiceFeedback.userId", "=", userId)
		.where("VoiceFeedback.createdAt", ">=", since)
		.executeTakeFirst();

	return Boolean(row);
}

export async function hasBeenKicked({
	roomId,
	userId,
}: {
	roomId: number;
	userId: number;
}) {
	const row = await db
		.selectFrom("VoiceSession")
		.select("VoiceSession.id")
		.where("VoiceSession.roomId", "=", roomId)
		.where("VoiceSession.userId", "=", userId)
		.where("VoiceSession.leaveReason", "=", "KICKED")
		.executeTakeFirst();

	return Boolean(row);
}

export function findOwnSessionById(id: number) {
	return db
		.selectFrom("VoiceSession")
		.select([
			"VoiceSession.id",
			"VoiceSession.roomId",
			"VoiceSession.connectedAt",
			"VoiceSession.leftAt",
		])
		.where("VoiceSession.id", "=", id)
		.where("VoiceSession.userId", "=", actorId())
		.executeTakeFirst();
}

export function findDailyAdoptionSince(since: number) {
	const day = sql<string>`date("ChatRoom"."createdAt", 'unixepoch')`;

	return db
		.selectFrom("ChatRoom")
		.select((eb) => [
			day.as("day"),
			"ChatRoom.type",
			eb.fn.countAll<number>().as("roomCount"),
			eb.fn
				.count<number>("ChatRoom.id")
				.filterWhere(
					eb.exists(
						eb
							.selectFrom("VoiceSession")
							.select("VoiceSession.id")
							.whereRef("VoiceSession.roomId", "=", "ChatRoom.id")
							.where("VoiceSession.connectedAt", "is not", null),
					),
				)
				.as("voiceRoomCount"),
			eb.fn
				.count<number>("ChatRoom.id")
				.filterWhere(
					eb
						.selectFrom("VoiceSession")
						.select((sub) =>
							sub.fn
								.count<number>("VoiceSession.userId")
								.distinct()
								.as("connectedUserCount"),
						)
						.whereRef("VoiceSession.roomId", "=", "ChatRoom.id")
						.where("VoiceSession.connectedAt", "is not", null),
					">=",
					2,
				)
				.as("conversationRoomCount"),
		])
		.where("ChatRoom.createdAt", ">=", since)
		.groupBy([day, "ChatRoom.type"])
		.orderBy("day", "asc")
		.execute();
}

export function findPlayerAdoptionSince(since: number) {
	const matchMembers = db
		.selectFrom("ChatRoom")
		.innerJoin("GroupMatch", "GroupMatch.chatRoomId", "ChatRoom.id")
		.innerJoin("GroupMember", (join) =>
			join.on((eb) =>
				eb.or([
					eb("GroupMember.groupId", "=", eb.ref("GroupMatch.alphaGroupId")),
					eb("GroupMember.groupId", "=", eb.ref("GroupMatch.bravoGroupId")),
				]),
			),
		)
		.select([
			"ChatRoom.id as roomId",
			"ChatRoom.type as roomType",
			"ChatRoom.createdAt as roomCreatedAt",
			"GroupMember.userId",
		])
		.where("ChatRoom.type", "=", "SQ_MATCH")
		.where("ChatRoom.createdAt", ">=", since);
	const groupMembers = db
		.selectFrom("ChatRoom")
		.innerJoin("Group", "Group.chatRoomId", "ChatRoom.id")
		.innerJoin("GroupMember", "GroupMember.groupId", "Group.id")
		.select([
			"ChatRoom.id as roomId",
			"ChatRoom.type as roomType",
			"ChatRoom.createdAt as roomCreatedAt",
			"GroupMember.userId",
		])
		.where("ChatRoom.type", "=", "SQ_GROUP")
		.where("ChatRoom.createdAt", ">=", since);
	const day = sql<string>`date("RoomMember"."roomCreatedAt", 'unixepoch')`;

	return db
		.selectFrom(matchMembers.unionAll(groupMembers).as("RoomMember"))
		.innerJoin("User", "User.id", "RoomMember.userId")
		.select((eb) => [
			day.as("day"),
			"RoomMember.roomType",
			"User.vc",
			eb.fn.countAll<number>().as("playerCount"),
			eb.fn
				.countAll<number>()
				.filterWhere(
					eb.exists(
						eb
							.selectFrom("VoiceSession")
							.select("VoiceSession.id")
							.whereRef("VoiceSession.roomId", "=", "RoomMember.roomId")
							.whereRef("VoiceSession.userId", "=", "RoomMember.userId")
							.where("VoiceSession.connectedAt", "is not", null),
					),
				)
				.as("connectedCount"),
		])
		.groupBy([day, "RoomMember.roomType", "User.vc"])
		.orderBy("day", "asc")
		.execute();
}

export function findVoiceChatPreferenceStatsSince(since: number) {
	return db
		.selectFrom("VoiceSession")
		.select((eb) => [
			"VoiceSession.vcPreference",
			eb.fn.countAll<number>().as("joinCount"),
			eb.fn
				.count<number>("VoiceSession.id")
				.filterWhere("VoiceSession.connectedAt", "is not", null)
				.as("connectedCount"),
			eb.fn
				.count<number>("VoiceSession.userId")
				.distinct()
				.as("uniqueUserCount"),
			eb.fn
				.count<number>("VoiceSession.id")
				.filterWhere("VoiceSession.talkSeconds", ">", 0)
				.as("talkedCount"),
			eb.fn.sum<number | null>("VoiceSession.talkSeconds").as("talkSeconds"),
		])
		.where("VoiceSession.createdAt", ">=", since)
		.groupBy("VoiceSession.vcPreference")
		.execute();
}

export function findVoiceChatPreferences(userIds: number[]) {
	if (userIds.length === 0) return Promise.resolve([]);

	return db
		.selectFrom("User")
		.select(["User.id", "User.vc"])
		.where("User.id", "in", userIds)
		.execute();
}

export function findPlatformStatsSince(since: number) {
	const connectedSeconds = sql<number>`coalesce("VoiceSession"."leftAt", ${databaseTimestampNow()}) - "VoiceSession"."connectedAt"`;

	return db
		.selectFrom("VoiceSession")
		.select((eb) => [
			"VoiceSession.platform",
			eb.fn.countAll<number>().as("joinCount"),
			eb.fn
				.count<number>("VoiceSession.id")
				.filterWhere("VoiceSession.connectedAt", "is not", null)
				.as("connectedCount"),
			eb.fn
				.count<number>("VoiceSession.id")
				.filterWhere("VoiceSession.connectedAt", "is not", null)
				.filterWhere(connectedSeconds, ">", 60)
				.as("stayedCount"),
			eb.fn
				.count<number>("VoiceSession.userId")
				.distinct()
				.as("uniqueUserCount"),
			sql<
				number | null
			>`avg(case when "VoiceSession"."connectedAt" is not null then min(${connectedSeconds}, ${MAX_SESSION_SECONDS}) end)`.as(
				"averageSeconds",
			),
			eb.fn
				.sum<number | null>("VoiceSession.lowQualitySeconds")
				.as("lowQualitySeconds"),
			eb.fn.sum<number | null>("VoiceSession.talkSeconds").as("talkSeconds"),
			eb.fn
				.count<number>("VoiceSession.id")
				.filterWhere("VoiceSession.networkQualityState", "=", "bad")
				.as("badNetworkCount"),
			eb.fn
				.count<number>("VoiceSession.id")
				.filterWhere("VoiceSession.inputMode", "=", "PUSH_TO_TALK")
				.as("pushToTalkCount"),
		])
		.where("VoiceSession.createdAt", ">=", since)
		.groupBy("VoiceSession.platform")
		.execute();
}

export function countLeaveReasonsSince(since: number) {
	return db
		.selectFrom("VoiceSession")
		.select((eb) => [
			"VoiceSession.platform",
			"VoiceSession.leaveReason",
			eb.fn.countAll<number>().as("count"),
		])
		.where("VoiceSession.createdAt", ">=", since)
		.where("VoiceSession.leaveReason", "is not", null)
		.groupBy(["VoiceSession.platform", "VoiceSession.leaveReason"])
		.execute();
}

export function countClientErrorsSince(since: number) {
	return db
		.selectFrom("VoiceClientError")
		.select((eb) => [
			"VoiceClientError.kind",
			"VoiceClientError.platform",
			eb.fn.countAll<number>().as("count"),
		])
		.where("VoiceClientError.createdAt", ">=", since)
		.groupBy(["VoiceClientError.kind", "VoiceClientError.platform"])
		.execute();
}

export function findLatestClientErrors() {
	return db
		.selectFrom("VoiceClientError")
		.innerJoin("User", "User.id", "VoiceClientError.userId")
		.select((eb) => [
			"VoiceClientError.id",
			"VoiceClientError.kind",
			"VoiceClientError.detail",
			"VoiceClientError.platform",
			"VoiceClientError.createdAt",
			commonUserJsonObject(eb).as("user"),
		])
		.orderBy("VoiceClientError.id", "desc")
		.limit(LATEST_ERRORS_LIMIT)
		.execute();
}

export function countRatingsSince(since: number) {
	return db
		.selectFrom("VoiceFeedback")
		.select((eb) => [
			"VoiceFeedback.rating",
			eb.fn.countAll<number>().as("count"),
		])
		.where("VoiceFeedback.createdAt", ">=", since)
		.groupBy("VoiceFeedback.rating")
		.orderBy("VoiceFeedback.rating", "asc")
		.execute();
}

export function findLatestFeedbackComments() {
	return db
		.selectFrom("VoiceFeedback")
		.innerJoin("User", "User.id", "VoiceFeedback.userId")
		.innerJoin(
			"VoiceSession",
			"VoiceSession.id",
			"VoiceFeedback.voiceSessionId",
		)
		.select((eb) => [
			"VoiceFeedback.id",
			"VoiceFeedback.rating",
			"VoiceFeedback.comment",
			"VoiceFeedback.createdAt",
			"VoiceSession.roomType",
			"VoiceSession.platform",
			commonUserJsonObject(eb).as("user"),
		])
		.where("VoiceFeedback.comment", "is not", null)
		.orderBy("VoiceFeedback.id", "desc")
		.limit(LATEST_FEEDBACK_LIMIT)
		.execute();
}

export async function insertOwnSession(
	args: Pick<
		TablesInsertable["VoiceSession"],
		| "roomId"
		| "roomType"
		| "feature"
		| "platform"
		| "eligibleMemberCount"
		| "vcPreference"
	>,
) {
	const { id } = await db
		.insertInto("VoiceSession")
		.values({ ...args, userId: actorId() })
		.returning("id")
		.executeTakeFirstOrThrow();

	// so concurrent joins can't both stay open and trip the kill switch in the process
	await db
		.updateTable("VoiceSession")
		.set({ leftAt: databaseTimestampNow(), leaveReason: "REPLACED" })
		.where("VoiceSession.userId", "=", actorId())
		.where("VoiceSession.id", "!=", id)
		.where("VoiceSession.leftAt", "is", null)
		.execute();

	return id;
}

export async function markOwnSessionConnected({
	id,
	dailySessionId,
}: {
	id: number;
	dailySessionId: string;
}) {
	await db
		.updateTable("VoiceSession")
		.set({ connectedAt: databaseTimestampNow(), dailySessionId })
		.where("VoiceSession.id", "=", id)
		.where("VoiceSession.userId", "=", actorId())
		.where("VoiceSession.connectedAt", "is", null)
		.execute();
}

export async function updateOwnSessionSummary({
	id,
	...summary
}: Pick<
	Tables["VoiceSession"],
	"id" | "lowQualitySeconds" | "talkSeconds" | "inputMode"
>) {
	await db
		.updateTable("VoiceSession")
		.set(summary)
		.where("VoiceSession.id", "=", id)
		.where("VoiceSession.userId", "=", actorId())
		.execute();
}

export async function markOwnSessionLeft({
	id,
	leaveReason,
}: {
	id: number;
	leaveReason: VoiceLeaveReason;
}) {
	await db
		.updateTable("VoiceSession")
		.set({ leftAt: databaseTimestampNow(), leaveReason })
		.where("VoiceSession.id", "=", id)
		.where("VoiceSession.userId", "=", actorId())
		.where("VoiceSession.leftAt", "is", null)
		.execute();
}

/** Ends the users open sessions of the room, for when they are taken out of the call rather than leaving it. */
export async function markSessionsLeft({
	roomId,
	userIds,
	leaveReason,
}: {
	roomId: number;
	userIds: number[];
	leaveReason: Extract<VoiceLeaveReason, "KICKED" | "EJECTED">;
}) {
	if (userIds.length === 0) return;

	await db
		.updateTable("VoiceSession")
		.set({ leftAt: databaseTimestampNow(), leaveReason })
		.where("VoiceSession.roomId", "=", roomId)
		.where("VoiceSession.userId", "in", userIds)
		.where("VoiceSession.leftAt", "is", null)
		.execute();
}

/** Whether the user is in the rooms call through a Daily session other than the given one, like after rejoining. */
export async function hasOtherConnectedSession({
	roomId,
	userId,
	dailySessionId,
}: {
	roomId: number;
	userId: number;
	dailySessionId: string;
}) {
	const row = await db
		.selectFrom("VoiceSession")
		.select("VoiceSession.id")
		.where("VoiceSession.roomId", "=", roomId)
		.where("VoiceSession.userId", "=", userId)
		.where("VoiceSession.leftAt", "is", null)
		.where("VoiceSession.connectedAt", "is not", null)
		.where("VoiceSession.dailySessionId", "!=", dailySessionId)
		.executeTakeFirst();

	return Boolean(row);
}

export async function updateFromLeftWebhook({
	dailySessionId,
	durationSeconds,
	networkQualityState,
	leftAt,
}: {
	dailySessionId: string;
	durationSeconds: number;
	networkQualityState: Tables["VoiceSession"]["networkQualityState"];
	leftAt: number;
}) {
	await db
		.updateTable("VoiceSession")
		.set((eb) => ({
			durationSeconds,
			networkQualityState,
			leftAt: eb.fn.coalesce("VoiceSession.leftAt", eb.val(leftAt)),
			leaveReason: eb.fn.coalesce(
				"VoiceSession.leaveReason",
				eb.val<VoiceLeaveReason>("EJECTED"),
			),
		}))
		.where("VoiceSession.dailySessionId", "=", dailySessionId)
		.execute();
}

export async function insertOwnClientError(
	args: Omit<TablesInsertable["VoiceClientError"], "userId" | "createdAt">,
) {
	await db
		.insertInto("VoiceClientError")
		.values({ ...args, userId: actorId() })
		.execute();
}

export async function insertOwnFeedback(
	args: Pick<
		TablesInsertable["VoiceFeedback"],
		"voiceSessionId" | "rating" | "comment"
	>,
) {
	await db
		.insertInto("VoiceFeedback")
		.values({ ...args, userId: actorId() })
		.onConflict((oc) => oc.column("voiceSessionId").doNothing())
		.execute();
}

export async function updateSettings({
	feature,
	isDisabled,
}: {
	feature?: VoiceFeature;
	isDisabled: boolean;
}) {
	await db
		.updateTable("VoiceSettings")
		.set({
			[feature ? KILL_SWITCH_COLUMN_BY_FEATURE[feature] : "isDisabled"]:
				toDBBoolean(isDisabled),
			updatedAt: databaseTimestampNow(),
			updatedByUserId: actorId(),
		})
		.execute();
}

export async function deleteOlderThan({
	sessionsBefore,
	errorsBefore,
}: {
	sessionsBefore: number;
	errorsBefore: number;
}) {
	await db.transaction().execute(async (trx) => {
		await trx
			.deleteFrom("VoiceClientError")
			.where("VoiceClientError.createdAt", "<", errorsBefore)
			.execute();
		await trx
			.deleteFrom("VoiceSession")
			.where("VoiceSession.createdAt", "<", sessionsBefore)
			.execute();
	});
}
