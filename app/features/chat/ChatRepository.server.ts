import type { ExpressionBuilder, Transaction } from "kysely";
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
import type { PersistedSystemMessageType } from "./chat-types";

const MESSAGES_DEFAULT_LIMIT = 500;

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
 * Ids of the rooms the user currently participates in (unexpired and unclosed).
 * Room-first per the resolver spike: drives from the open room set and probes
 * membership through the owner tables' indexes, never searching on the JSON
 * opponent ids.
 */
export async function findAllOpenRoomIdsByUserId(
	userId: number,
): Promise<number[]> {
	const now = databaseTimestampNow();

	const openRooms = () =>
		db
			.selectFrom("ChatRoom")
			.select("ChatRoom.id")
			.where("ChatRoom.expiresAt", ">", now)
			.where("ChatRoom.closedAt", "is", null);

	const rooms = await Promise.all([
		openRooms()
			.innerJoin("Group", "Group.chatRoomId", "ChatRoom.id")
			.where(({ exists, selectFrom }) =>
				exists(
					selectFrom("GroupMember")
						.select("GroupMember.userId")
						.whereRef("GroupMember.groupId", "=", "Group.id")
						.where("GroupMember.userId", "=", userId),
				),
			)
			.execute(),
		openRooms()
			.innerJoin("GroupMatch", "GroupMatch.chatRoomId", "ChatRoom.id")
			.where(({ exists, selectFrom }) =>
				exists(
					selectFrom("GroupMember")
						.select("GroupMember.userId")
						.where("GroupMember.userId", "=", userId)
						.where((eb) =>
							eb.or([
								eb(
									"GroupMember.groupId",
									"=",
									eb.ref("GroupMatch.alphaGroupId"),
								),
								eb(
									"GroupMember.groupId",
									"=",
									eb.ref("GroupMatch.bravoGroupId"),
								),
							]),
						),
				),
			)
			.execute(),
		openRooms()
			.innerJoin("TournamentMatch", "TournamentMatch.chatRoomId", "ChatRoom.id")
			.where(({ exists, selectFrom }) =>
				exists(
					selectFrom("TournamentTeamMember")
						.select("TournamentTeamMember.userId")
						.where("TournamentTeamMember.userId", "=", userId)
						.where((eb) =>
							eb.or([
								eb(
									"TournamentTeamMember.tournamentTeamId",
									"=",
									opponentTeamId("opponentOne"),
								),
								eb(
									"TournamentTeamMember.tournamentTeamId",
									"=",
									opponentTeamId("opponentTwo"),
								),
							]),
						),
				),
			)
			.execute(),
		openRooms()
			.innerJoin("TournamentTeam", "TournamentTeam.chatRoomId", "ChatRoom.id")
			.where(({ exists, selectFrom }) =>
				exists(
					selectFrom("TournamentTeamMember")
						.select("TournamentTeamMember.userId")
						.whereRef(
							"TournamentTeamMember.tournamentTeamId",
							"=",
							"TournamentTeam.id",
						)
						.where("TournamentTeamMember.userId", "=", userId),
				),
			)
			.execute(),
		openRooms()
			.innerJoin("ScrimPost", "ScrimPost.chatRoomId", "ChatRoom.id")
			.where((eb) =>
				eb.or([
					eb.exists(
						eb
							.selectFrom("ScrimPostUser")
							.select("ScrimPostUser.userId")
							.whereRef("ScrimPostUser.scrimPostId", "=", "ScrimPost.id")
							.where("ScrimPostUser.userId", "=", userId),
					),
					eb.exists(
						eb
							.selectFrom("ScrimPostRequestUser")
							.innerJoin(
								"ScrimPostRequest",
								"ScrimPostRequest.id",
								"ScrimPostRequestUser.scrimPostRequestId",
							)
							.select("ScrimPostRequestUser.userId")
							.whereRef("ScrimPostRequest.scrimPostId", "=", "ScrimPost.id")
							.where("ScrimPostRequest.isAccepted", "=", 1)
							.where("ScrimPostRequestUser.userId", "=", userId),
					),
				]),
			)
			.execute(),
	]);

	return rooms.flat().map((room) => room.id);
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

/** Deletes rooms no owner row points at any more, returning how many. Backstop for owner deletes that missed their room. */
export async function deleteOrphanedRooms() {
	const result = await db
		.deleteFrom("ChatRoom")
		.where((eb) =>
			eb.and([
				noOwner(eb, "Group"),
				noOwner(eb, "GroupMatch"),
				noOwner(eb, "TournamentMatch"),
				noOwner(eb, "TournamentTeam"),
				noOwner(eb, "ScrimPost"),
			]),
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
