import { add } from "date-fns";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as ChatRoomFactory from "~/db/seed/factories/ChatRoomFactory";
import * as SQGroupFactory from "~/db/seed/factories/SQGroupFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import invariant from "~/utils/invariant";
import { CloseExpiredChatRoomsRoutine } from "./closeExpiredChatRooms";

const users = UserFactory.pool();

/** Creates a group whose chat room expires 12h from now, then jumps to `travelTo`. */
const setupGroupChatRoom = async (travelTo: Date) => {
	const group = await SQGroupFactory.create({ memberUserIds: [users.id(1)] });

	const { chatRoomId } = await db
		.selectFrom("Group")
		.select("Group.chatRoomId")
		.where("Group.id", "=", group.id)
		.executeTakeFirstOrThrow();
	invariant(chatRoomId, "Group has no chat room");

	vi.setSystemTime(travelTo);

	return chatRoomId;
};

const roomById = (id: number) =>
	db.selectFrom("ChatRoom").selectAll().where("id", "=", id).executeTakeFirst();

describe("CloseExpiredChatRoomsRoutine", () => {
	beforeEach(async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-15T12:00:00Z"));

		await users.create(1);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("closes a room that expired over a month ago, keeping its messages", async () => {
		const chatRoomId = await setupGroupChatRoom(add(new Date(), { months: 2 }));

		await CloseExpiredChatRoomsRoutine.run();

		expect((await roomById(chatRoomId))?.closedAt).not.toBeNull();
	});

	test("leaves a room that expired under a month ago open", async () => {
		const chatRoomId = await setupGroupChatRoom(add(new Date(), { days: 7 }));

		await CloseExpiredChatRoomsRoutine.run();

		expect((await roomById(chatRoomId))?.closedAt).toBeNull();
	});

	test("deletes a room no owner points at", async () => {
		const orphanedRoom = await ChatRoomFactory.create();

		await CloseExpiredChatRoomsRoutine.run();

		expect(await roomById(orphanedRoom.id)).toBeUndefined();
	});
});
