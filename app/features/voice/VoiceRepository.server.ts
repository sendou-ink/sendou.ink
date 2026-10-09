import { sql } from "kysely";
import { db } from "~/db/sql";
import type { Tables, TablesInsertable } from "~/db/tables";
import { actorId } from "~/features/auth/core/user.server";
import { databaseTimestampNow } from "~/utils/dates";
import { commonUserJsonObject } from "~/utils/kysely.server";
import { toDBBoolean } from "~/utils/sql";
import {
	VOICE_ROOM_TYPES,
	VOICE_TOKEN_LIFETIME_MINUTES,
	type VoiceLeaveReason,
} from "./voice-constants";

const MAX_SESSION_SECONDS = VOICE_TOKEN_LIFETIME_MINUTES * 60;

const LATEST_ERRORS_LIMIT = 50;
const LATEST_FEEDBACK_LIMIT = 30;

export async function findSettings() {
	const row = await db
		.selectFrom("VoiceSettings")
		.select(["VoiceSettings.isDisabled", "VoiceSettings.updatedAt"])
		.orderBy("VoiceSettings.id", "asc")
		.executeTakeFirst();

	return {
		isDisabled: Boolean(row?.isDisabled),
		updatedAt: row?.updatedAt ?? null,
	};
}

export async function sumParticipantMinutesSince(since: number) {
	const row = await db
		.selectFrom("VoiceSession")
		.select(
			sql<number>`coalesce(sum(coalesce(
				"VoiceSession"."durationSeconds",
				min(coalesce("VoiceSession"."leftAt", ${databaseTimestampNow()}) - "VoiceSession"."connectedAt", ${MAX_SESSION_SECONDS})
			)), 0) / 60.0`.as("minutes"),
		)
		.where("VoiceSession.connectedAt", "is not", null)
		.where("VoiceSession.createdAt", ">=", since)
		.executeTakeFirstOrThrow();

	return row.minutes;
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
		])
		.where("ChatRoom.type", "in", [...VOICE_ROOM_TYPES])
		.where("ChatRoom.createdAt", ">=", since)
		.groupBy([day, "ChatRoom.type"])
		.orderBy("day", "asc")
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
		"roomId" | "roomType" | "platform" | "eligibleMemberCount"
	>,
) {
	const { id } = await db
		.insertInto("VoiceSession")
		.values({ ...args, userId: actorId() })
		.returning("id")
		.executeTakeFirstOrThrow();

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

export async function markSessionsKicked({
	roomId,
	userId,
}: {
	roomId: number;
	userId: number;
}) {
	await db
		.updateTable("VoiceSession")
		.set({ leftAt: databaseTimestampNow(), leaveReason: "KICKED" })
		.where("VoiceSession.roomId", "=", roomId)
		.where("VoiceSession.userId", "=", userId)
		.where("VoiceSession.leftAt", "is", null)
		.execute();
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

export async function updateSettings({ isDisabled }: { isDisabled: boolean }) {
	await db
		.updateTable("VoiceSettings")
		.set({
			isDisabled: toDBBoolean(isDisabled),
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
