import { sub } from "date-fns";
import { sql } from "kysely";
import { db } from "#lib/server/db/sql.ts";
import { commonUserSelect } from "#lib/server/kysely.ts";
import { dateToDatabaseTimestamp } from "#lib/utils/dates.ts";
import type { ChatMessageContext, ChatSystemMessageType } from "./chat-types.ts";
import { CHAT } from "./chat-constants.ts";

/**
 * Finds the scrim's chat room, creating it on first access. Rooms are created
 * lazily so scrims accepted before the chat rebuild (and seeded ones) get a
 * room the first time somebody opens the scrim page.
 */
export async function ensureRoomForScrim({
	scrimPostId,
	inactiveAt,
}: {
	scrimPostId: number;
	inactiveAt: number;
}) {
	const existing = await db
		.selectFrom("ChatRoom")
		.selectAll()
		.where("scrimPostId", "=", scrimPostId)
		.executeTakeFirst();
	if (existing) return existing;

	await db
		.insertInto("ChatRoom")
		.values({ scrimPostId, inactiveAt })
		.onConflict((oc) => oc.doNothing())
		.execute();

	return db
		.selectFrom("ChatRoom")
		.selectAll()
		.where("scrimPostId", "=", scrimPostId)
		.executeTakeFirstOrThrow();
}

export function findRoomById(chatRoomId: number) {
	return db
		.selectFrom("ChatRoom")
		.selectAll()
		.where("id", "=", chatRoomId)
		.executeTakeFirst();
}

export function findRoomByScrimPostId(scrimPostId: number) {
	return db
		.selectFrom("ChatRoom")
		.selectAll()
		.where("scrimPostId", "=", scrimPostId)
		.executeTakeFirst();
}

export function setRoomInactiveAt(chatRoomId: number, inactiveAt: Date) {
	return db
		.updateTable("ChatRoom")
		.set({ inactiveAt: dateToDatabaseTimestamp(inactiveAt) })
		.where("id", "=", chatRoomId)
		.execute();
}

/** The newest messages of a room in chronological order. */
export async function findMessagesByRoomId(chatRoomId: number) {
	const newestFirst = await db
		.selectFrom("ChatRoomMessage")
		.select([
			"id",
			"userId",
			"type",
			"contents",
			"context",
			"createdAt",
		])
		.where("chatRoomId", "=", chatRoomId)
		.orderBy("id", "desc")
		.limit(CHAT.MESSAGES_SHOWN)
		.execute();

	return newestFirst.reverse();
}

export function insertMessage({
	chatRoomId,
	userId,
	contents,
}: {
	chatRoomId: number;
	userId: number;
	contents: string;
}) {
	return db
		.insertInto("ChatRoomMessage")
		.values({ chatRoomId, userId, contents })
		.returning("id")
		.executeTakeFirstOrThrow();
}

export function insertSystemMessage({
	chatRoomId,
	type,
	context,
}: {
	chatRoomId: number;
	type: ChatSystemMessageType;
	context?: ChatMessageContext;
}) {
	return db
		.insertInto("ChatRoomMessage")
		.values({
			chatRoomId,
			type,
			context: context ? JSON.stringify(context) : null,
		})
		.returning("id")
		.executeTakeFirstOrThrow();
}

/** Marks messages up to `lastSeenMessageId` seen; never moves the marker back. */
export function upsertRead({
	chatRoomId,
	userId,
	lastSeenMessageId,
}: {
	chatRoomId: number;
	userId: number;
	lastSeenMessageId: number;
}) {
	return db
		.insertInto("ChatRoomRead")
		.values({ chatRoomId, userId, lastSeenMessageId })
		.onConflict((oc) =>
			oc.columns(["chatRoomId", "userId"]).doUpdateSet((eb) => ({
				lastSeenMessageId: eb.fn("max", [
					eb.ref("ChatRoomRead.lastSeenMessageId"),
					eb.val(lastSeenMessageId),
				]),
			})),
		)
		.execute();
}

const userChatNameHue = sql<
	string | null
>`IIF(COALESCE("User"."patronTier", 0) >= 2, "User"."customTheme" ->> '--_chat-h', null)`.as(
	"chatNameHue",
);

/** Display info for message authors, keyed by user id. */
export async function findChatUsersByUserIds(userIds: number[]) {
	if (userIds.length === 0) return {};

	const users = await db
		.selectFrom("User")
		.select((eb) => [...commonUserSelect(eb), userChatNameHue])
		.where("User.id", "in", userIds)
		.execute();

	return Object.fromEntries(users.map((user) => [user.id, user]));
}

/**
 * The user's chat rooms (via the scrims they participate in), newest first,
 * with unseen counts. Archived rooms are excluded at the query level by the
 * archival cutoff; exact lifecycle is derived by the caller.
 */
export async function findRoomsOfUser(userId: number) {
	const archiveCutoff = dateToDatabaseTimestamp(
		sub(new Date(), { hours: CHAT.INACTIVE_TO_ARCHIVED_HOURS }),
	);

	return db
		.selectFrom("ChatRoom")
		.innerJoin("ScrimPost", "ScrimPost.id", "ChatRoom.scrimPostId")
		.select((eb) => [
			"ChatRoom.id",
			"ChatRoom.scrimPostId",
			"ChatRoom.inactiveAt",
			"ChatRoom.createdAt",
			"ScrimPost.startsAt as scrimStartsAt",
			eb
				.selectFrom("ChatRoomMessage")
				.select((eb2) => eb2.fn.max("ChatRoomMessage.id").as("lastMessageId"))
				.whereRef("ChatRoomMessage.chatRoomId", "=", "ChatRoom.id")
				.as("lastMessageId"),
			eb
				.selectFrom("ChatRoomMessage")
				.select((eb2) => eb2.fn.countAll<number>().as("count"))
				.whereRef("ChatRoomMessage.chatRoomId", "=", "ChatRoom.id")
				// no read marker yet = everything is unseen, hence the coalesce
				.where("ChatRoomMessage.id", ">", (eb2) =>
					eb2.fn.coalesce(
						eb2
							.selectFrom("ChatRoomRead")
							.select("lastSeenMessageId")
							.whereRef("ChatRoomRead.chatRoomId", "=", "ChatRoom.id")
							.where("ChatRoomRead.userId", "=", userId),
						eb2.val(0),
					),
				)
				.as("unseenCount"),
		])
		.where((eb) =>
			eb.or([
				eb("ChatRoom.inactiveAt", "is", null),
				eb("ChatRoom.inactiveAt", ">", archiveCutoff),
			]),
		)
		.where((eb) =>
			eb.exists(
				eb
					.selectFrom("ScrimPostUser")
					.select("ScrimPostUser.userId")
					.whereRef("ScrimPostUser.scrimPostId", "=", "ScrimPost.id")
					.where("ScrimPostUser.userId", "=", userId)
					.union(
						eb
							.selectFrom("ScrimPostRequest")
							.innerJoin(
								"ScrimPostRequestUser",
								"ScrimPostRequestUser.scrimPostRequestId",
								"ScrimPostRequest.id",
							)
							.select("ScrimPostRequestUser.userId")
							.whereRef(
								"ScrimPostRequest.scrimPostId",
								"=",
								"ScrimPost.id",
							)
							.where("ScrimPostRequest.isAccepted", "=", 1)
							.where("ScrimPostRequestUser.userId", "=", userId),
					),
			),
		)
		.orderBy("ChatRoom.id", "desc")
		.execute();
}

/** Ids of the users allowed in the room (the scrim's participants). */
export async function findRoomMemberIds(chatRoomId: number) {
	const rows = await db
		.selectFrom("ChatRoom")
		.innerJoin("ScrimPostUser", "ScrimPostUser.scrimPostId", "ChatRoom.scrimPostId")
		.select("ScrimPostUser.userId")
		.where("ChatRoom.id", "=", chatRoomId)
		.union((eb) =>
			eb
				.selectFrom("ChatRoom")
				.innerJoin(
					"ScrimPostRequest",
					"ScrimPostRequest.scrimPostId",
					"ChatRoom.scrimPostId",
				)
				.innerJoin(
					"ScrimPostRequestUser",
					"ScrimPostRequestUser.scrimPostRequestId",
					"ScrimPostRequest.id",
				)
				.select("ScrimPostRequestUser.userId")
				.where("ChatRoom.id", "=", chatRoomId)
				.where("ScrimPostRequest.isAccepted", "=", 1),
		)
		.execute();

	return rows.map((row) => row.userId);
}

/** Permanently deletes rooms (and their messages) inactive for over a week. */
export function deleteRoomsInactiveForAWeek() {
	return db
		.deleteFrom("ChatRoom")
		.where(
			"inactiveAt",
			"<",
			dateToDatabaseTimestamp(
				sub(new Date(), { days: CHAT.DELETE_AFTER_INACTIVE_DAYS }),
			),
		)
		.executeTakeFirst();
}
