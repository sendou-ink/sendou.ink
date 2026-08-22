import type { Transaction } from "kysely";
import { sql } from "kysely";
import { db } from "~/db/sql";
import type { DB, Tables, TablesInsertable } from "~/db/tables";
import { databaseTimestampNow, dateToDatabaseTimestamp } from "~/utils/dates";
import { shortNanoid } from "~/utils/id";
import {
	commonUserSelect,
	jsonObjectFrom,
	userChatNameHue,
} from "~/utils/kysely.server";
import type { PersistedSystemMessageType } from "./chat-types";

const MESSAGES_DEFAULT_LIMIT = 500;

/** Returns the latest `limit` messages of a room, oldest first, authors resolved live. */
export async function findAllMessagesByRoomId(
	roomId: number,
	{ limit = MESSAGES_DEFAULT_LIMIT }: { limit?: number } = {},
) {
	const rows = await db
		.selectFrom("ChatMessage")
		.select((eb) => [
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
		])
		.where("ChatMessage.roomId", "=", roomId)
		.orderBy("ChatMessage.id", "desc")
		.limit(limit)
		.execute();

	return rows.reverse();
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
