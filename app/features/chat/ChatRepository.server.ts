import { subHours } from "date-fns";
import type { ExpressionBuilder, SqlBool, Transaction } from "kysely";
import { sql } from "kysely";
import * as R from "remeda";
import { db } from "~/db/sql";
import type { DB, Tables, TablesInsertable } from "~/db/tables";
import { databaseTimestampNow, dateToDatabaseTimestamp } from "~/utils/dates";
import { shortNanoid } from "~/utils/id";
import {
	commonUserSelect,
	jsonObjectFrom,
	userChatNameHue,
} from "~/utils/kysely.server";
import { toDBBoolean } from "~/utils/sql";
import type { ChatRoomType, PersistedSystemMessageType } from "./chat-types";

const MESSAGES_DEFAULT_LIMIT = 500;

/**
 * How far back the room list looks for SendouQ memberships: an unmatched group goes inactive
 * after an hour and a match room lives a day, so no open room hangs off an older membership.
 * Keeps a veteran's thousands of past groups out of the lookup — raise rather than let a room vanish.
 */
const SQ_MEMBERSHIP_LOOKBACK_HOURS = 72;

/** Chat rooms by id. */
export async function findAllRoomsByIds(roomIds: number[]) {
	if (roomIds.length === 0) return [];

	return db
		.selectFrom("ChatRoom")
		.selectAll()
		.where("ChatRoom.id", "in", roomIds)
		.execute();
}

/**
 * Ids of the open rooms the user participates in. Membership-first: every branch starts from the
 * user's own membership rows so the cost tracks their participation, not the site's open room
 * count. SendouQ branches narrow further to {@link SQ_MEMBERSHIP_LOOKBACK_HOURS}.
 */
export async function findAllOpenRoomIdsByUserId(
	userId: number,
): Promise<number[]> {
	const now = databaseTimestampNow();
	const openRoom = (chatRoomIdColumn: string) =>
		isOpenRoom(chatRoomIdColumn, now);
	const joinedSince = dateToDatabaseTimestamp(
		subHours(new Date(), SQ_MEMBERSHIP_LOOKBACK_HOURS),
	);

	// the opponent ids live in JSON, and only literal team ids get the two
	// expression indexes over them picked, so they are fetched first
	const tournamentTeamIds = (
		await db
			.selectFrom("TournamentTeamMember")
			.select("TournamentTeamMember.tournamentTeamId")
			.where("TournamentTeamMember.userId", "=", userId)
			.execute()
	).map((row) => row.tournamentTeamId);

	const rooms = await Promise.all([
		db
			.selectFrom("GroupMember")
			.innerJoin("Group", "Group.id", "GroupMember.groupId")
			.select("Group.chatRoomId as id")
			.where("GroupMember.userId", "=", userId)
			.where("GroupMember.createdAt", ">", joinedSince)
			.where(openRoom("Group.chatRoomId"))
			.execute(),
		// a side per query so both group id indexes are used, which an `or` denies
		db
			.selectFrom("GroupMember")
			.innerJoin("GroupMatch", "GroupMatch.alphaGroupId", "GroupMember.groupId")
			.select("GroupMatch.chatRoomId as id")
			.where("GroupMember.userId", "=", userId)
			.where("GroupMember.createdAt", ">", joinedSince)
			.where(openRoom("GroupMatch.chatRoomId"))
			.execute(),
		db
			.selectFrom("GroupMember")
			.innerJoin("GroupMatch", "GroupMatch.bravoGroupId", "GroupMember.groupId")
			.select("GroupMatch.chatRoomId as id")
			.where("GroupMember.userId", "=", userId)
			.where("GroupMember.createdAt", ">", joinedSince)
			.where(openRoom("GroupMatch.chatRoomId"))
			.execute(),
		tournamentTeamIds.length === 0
			? []
			: db
					.selectFrom("TournamentMatch")
					.select("TournamentMatch.chatRoomId as id")
					.where((eb) =>
						eb.or([
							eb(opponentTeamId("opponentOne"), "in", tournamentTeamIds),
							eb(opponentTeamId("opponentTwo"), "in", tournamentTeamIds),
						]),
					)
					.where(openRoom("TournamentMatch.chatRoomId"))
					.execute(),
		db
			.selectFrom("TournamentTeamMember")
			.innerJoin(
				"TournamentTeam",
				"TournamentTeam.id",
				"TournamentTeamMember.tournamentTeamId",
			)
			.select("TournamentTeam.chatRoomId as id")
			.where("TournamentTeamMember.userId", "=", userId)
			.where(openRoom("TournamentTeam.chatRoomId"))
			.execute(),
		db
			.selectFrom("ScrimPostUser")
			.innerJoin("ScrimPost", "ScrimPost.id", "ScrimPostUser.scrimPostId")
			.select("ScrimPost.chatRoomId as id")
			.where("ScrimPostUser.userId", "=", userId)
			.where(openRoom("ScrimPost.chatRoomId"))
			.execute(),
		db
			.selectFrom("ScrimPostRequestUser")
			.innerJoin(
				"ScrimPostRequest",
				"ScrimPostRequest.id",
				"ScrimPostRequestUser.scrimPostRequestId",
			)
			.innerJoin("ScrimPost", "ScrimPost.id", "ScrimPostRequest.scrimPostId")
			.select("ScrimPost.chatRoomId as id")
			.where("ScrimPostRequestUser.userId", "=", userId)
			.where("ScrimPostRequest.isAccepted", "=", 1)
			.where(openRoom("ScrimPost.chatRoomId"))
			.execute(),
	]);

	return R.unique(
		rooms
			.flat()
			.map((room) => room.id)
			.filter((id) => id !== null),
	);
}

/** Returns the latest `limit` messages of a room, oldest first, authors resolved live. */
export async function findAllMessagesByRoomId(
	roomId: number,
	{ limit = MESSAGES_DEFAULT_LIMIT }: { limit?: number } = {},
) {
	const rows = await db
		.selectFrom("ChatMessage")
		.select(messageWithAuthorSelect)
		.where("ChatMessage.roomId", "=", roomId)
		.orderBy("ChatMessage.id", "desc")
		.limit(limit)
		.execute();

	return rows.reverse();
}

/** Returns a message with its author resolved live. */
export function findMessageById(messageId: number) {
	return db
		.selectFrom("ChatMessage")
		.select(messageWithAuthorSelect)
		.where("ChatMessage.id", "=", messageId)
		.executeTakeFirst();
}

/** Per-room message stats for the user: unread count (messages newer than their read indicator) and the latest message. Rooms with no messages are left out. */
export async function findMessageStatsByRoomIds(
	userId: number,
	roomIds: number[],
): Promise<
	Array<{
		roomId: number;
		unreadCount: number;
		latestMessageId: number;
		latestMessageCreatedAt: number;
	}>
> {
	if (roomIds.length === 0) return [];

	return db
		.selectFrom("ChatMessage")
		.leftJoin("ChatMessageReadIndicator", (join) =>
			join
				.onRef("ChatMessageReadIndicator.roomId", "=", "ChatMessage.roomId")
				.on("ChatMessageReadIndicator.userId", "=", userId),
		)
		.select(({ eb, fn, val }) => [
			"ChatMessage.roomId",
			fn
				.sum<number>(
					eb
						.case()
						.when(
							"ChatMessage.id",
							">",
							fn.coalesce("ChatMessageReadIndicator.lastSeenMessageId", val(0)),
						)
						.then(1)
						.else(0)
						.end(),
				)
				.as("unreadCount"),
			fn.max<number>("ChatMessage.id").as("latestMessageId"),
			fn.max<number>("ChatMessage.createdAt").as("latestMessageCreatedAt"),
		])
		.where("ChatMessage.roomId", "in", roomIds)
		.groupBy("ChatMessage.roomId")
		.execute();
}

/** Inserts a chat room, returning the row. Called in the owning entity's insert transaction. */
export function insertRoom(
	args: { type: Tables["ChatRoom"]["type"]; expiresAt: Date },
	trx?: Transaction<DB>,
) {
	const executor = trx ?? db;

	return executor
		.insertInto("ChatRoom")
		.values({
			type: args.type,
			expiresAt: dateToDatabaseTimestamp(args.expiresAt),
		})
		.returningAll()
		.executeTakeFirstOrThrow();
}

/** Inserts `count` chat rooms of one type, returning their ids in insertion order. Called in the owning entity's insert transaction. */
export async function insertRooms(
	args: {
		type: Tables["ChatRoom"]["type"];
		expiresAt: Date;
		count: number;
	},
	trx?: Transaction<DB>,
): Promise<number[]> {
	if (args.count === 0) return [];

	const executor = trx ?? db;

	const inserted = await executor
		.insertInto("ChatRoom")
		.values(
			R.range(0, args.count).map(() => ({
				type: args.type,
				expiresAt: dateToDatabaseTimestamp(args.expiresAt),
			})),
		)
		.returning("id")
		.execute();

	// the rows are identical, so sorting the ids is enough to line them up with
	// the callers' insertion order (RETURNING makes no ordering promise)
	return inserted.map((room) => room.id).sort((a, b) => a - b);
}

/** Extends a room's lifetime, e.g. when a successor group carries its chat over. */
export async function updateRoomExpiresAt(
	args: { roomId: number; expiresAt: Date },
	trx?: Transaction<DB>,
) {
	const executor = trx ?? db;

	await executor
		.updateTable("ChatRoom")
		.set({ expiresAt: dateToDatabaseTimestamp(args.expiresAt) })
		.where("ChatRoom.id", "=", args.roomId)
		.execute();
}

/** Marks rooms' owner activity as concluded, or active again (a reopened tournament match). */
export async function updateRoomsInactive(
	roomIds: Array<number | null>,
	inactive: boolean,
	trx?: Transaction<DB>,
) {
	const idsToUpdate = roomIds.filter((id) => id !== null);
	if (idsToUpdate.length === 0) return;

	const executor = trx ?? db;

	await executor
		.updateTable("ChatRoom")
		.set({ inactive: toDBBoolean(inactive) })
		.where("ChatRoom.id", "in", idsToUpdate)
		.execute();
}

/** Deletes rooms and their messages. Called in the owning entity's delete transaction. */
export async function deleteRoomsByIds(
	roomIds: Array<number | null>,
	trx?: Transaction<DB>,
) {
	const idsToDelete = roomIds.filter((id) => id !== null);
	if (idsToDelete.length === 0) return;

	const executor = trx ?? db;

	await executor
		.deleteFrom("ChatRoom")
		.where("ChatRoom.id", "in", idsToDelete)
		.execute();
}

type InsertMessageArgs = Pick<
	TablesInsertable["ChatMessage"],
	"roomId" | "publicId"
> & {
	authorUserId: number;
	contents: string;
};

/** Inserts a user message. A `publicId` conflict (retried send) returns the existing row instead. */
export async function insertMessage(args: InsertMessageArgs) {
	const inserted = await db
		.insertInto("ChatMessage")
		.values(args)
		.onConflict((oc) => oc.column("publicId").doNothing())
		.returningAll()
		.executeTakeFirst();

	if (inserted) return inserted;

	return db
		.selectFrom("ChatMessage")
		.selectAll()
		.where("ChatMessage.publicId", "=", args.publicId)
		.executeTakeFirstOrThrow();
}

/** Inserts a system message rendered client-side from its `type`; `authorUserId` is the actor it describes. */
export function insertSystemMessage(
	args: {
		roomId: number;
		type: PersistedSystemMessageType;
		authorUserId: number;
	},
	trx?: Transaction<DB>,
) {
	const executor = trx ?? db;

	return executor
		.insertInto("ChatMessage")
		.values({ ...args, publicId: shortNanoid() })
		.returningAll()
		.executeTakeFirstOrThrow();
}

/** Marks the newest message a user has seen in a room. Never regresses: upserts keep the MAX. */
export async function upsertReadIndicator(
	args: TablesInsertable["ChatMessageReadIndicator"],
) {
	await db
		.insertInto("ChatMessageReadIndicator")
		.values(args)
		.onConflict((oc) =>
			oc.columns(["userId", "roomId"]).doUpdateSet({
				lastSeenMessageId: sql`max("ChatMessageReadIndicator"."lastSeenMessageId", "excluded"."lastSeenMessageId")`,
			}),
		)
		.execute();
}

/** Closes rooms whose expiry is before `expiredBefore`, returning how many. Messages are kept; access narrows. */
export async function closeExpiredRooms(expiredBefore: Date) {
	const result = await db
		.updateTable("ChatRoom")
		.set({ closedAt: databaseTimestampNow() })
		.where("ChatRoom.expiresAt", "<", dateToDatabaseTimestamp(expiredBefore))
		.where("ChatRoom.closedAt", "is", null)
		.executeTakeFirst();

	return Number(result.numUpdatedRows);
}

/** Deletes rooms no owner row points at any more (backstop for owner deletes that missed their room), returning how many. A room's type names its one owner table. */
export async function deleteOrphanedRooms() {
	const result = await db
		.deleteFrom("ChatRoom")
		.where((eb) =>
			eb.or(
				R.entries(OWNER_TABLE_BY_ROOM_TYPE).map(([type, table]) =>
					eb.and([eb("ChatRoom.type", "=", type), noOwner(eb, table)]),
				),
			),
		)
		.executeTakeFirst();

	return Number(result.numDeletedRows);
}

type ChatRoomOwnerTable =
	| "Group"
	| "GroupMatch"
	| "TournamentMatch"
	| "TournamentTeam"
	| "ScrimPost";

/** The one table that can own a room of each type. */
const OWNER_TABLE_BY_ROOM_TYPE = {
	SQ_GROUP: "Group",
	SQ_MATCH: "GroupMatch",
	TOURNAMENT_MATCH: "TournamentMatch",
	TOURNAMENT_TEAM: "TournamentTeam",
	SCRIM: "ScrimPost",
} as const satisfies Record<ChatRoomType, ChatRoomOwnerTable>;

function noOwner(
	eb: ExpressionBuilder<DB, "ChatRoom">,
	table: ChatRoomOwnerTable,
) {
	return eb.not(
		eb.exists(
			eb
				.selectFrom(table)
				.select(sql<number>`1`.as("one"))
				.whereRef(`${table}.chatRoomId`, "=", "ChatRoom.id"),
		),
	);
}

/** Whether the owner row's room is one the user can still be in: unexpired and unclosed. */
function isOpenRoom(chatRoomIdColumn: string, now: number) {
	return sql<SqlBool>`exists (
		select 1 from "ChatRoom"
		where "ChatRoom"."id" = ${sql.ref(chatRoomIdColumn)}
			and "ChatRoom"."expiresAt" > ${now}
			and "ChatRoom"."closedAt" is null
	)`;
}

function opponentTeamId(column: "opponentOne" | "opponentTwo") {
	return sql<number>`${sql.ref(`TournamentMatch.${column}`)} ->> '$.id'`;
}

function messageWithAuthorSelect(eb: ExpressionBuilder<DB, "ChatMessage">) {
	return [
		"ChatMessage.id",
		"ChatMessage.roomId",
		"ChatMessage.authorUserId",
		"ChatMessage.type",
		"ChatMessage.contents",
		"ChatMessage.publicId",
		"ChatMessage.createdAt",
		jsonObjectFrom(
			eb
				.selectFrom("User")
				.select((userEb) => [
					...commonUserSelect(userEb),
					"User.pronouns",
					userChatNameHue,
				])
				.whereRef("User.id", "=", "ChatMessage.authorUserId"),
		).as("author"),
	] as const;
}
