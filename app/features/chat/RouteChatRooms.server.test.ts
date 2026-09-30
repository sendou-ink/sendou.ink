import { beforeEach, describe, expect, test } from "vitest";
import * as ChatMessageFactory from "~/db/seed/factories/ChatMessageFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as RouteChatRooms from "./RouteChatRooms.server";
import { setupSqMatch } from "./tests/fixtures";

const users = UserFactory.pool();

const outsiderId = () => users.id(10);

beforeEach(async () => {
	await users.create(10);
});

describe("RouteChatRooms.resolve", () => {
	test("hands a participant the room as listed along with its history", async () => {
		const { match, alphaUserIds } = await setupSqMatch(users);
		await ChatMessageFactory.create({
			roomId: match.chatRoomId!,
			authorUserId: alphaUserIds[1],
			contents: "gg",
		});

		const rooms = await RouteChatRooms.resolve({ id: alphaUserIds[0] }, [
			{ roomId: match.chatRoomId!, autoOpen: true },
		]);

		expect(rooms).toHaveLength(1);
		expect(rooms[0].autoOpen).toBe(true);
		expect(rooms[0].room).toMatchObject({
			id: match.chatRoomId,
			type: "SQ_MATCH",
			canPost: true,
			unreadCount: 1,
		});
		expect(rooms[0].messages?.map((message) => message.contents)).toEqual([
			"gg",
		]);
	});

	test("leaves the history of a room only listed to be fetched on open", async () => {
		const { match, alphaUserIds } = await setupSqMatch(users);

		const rooms = await RouteChatRooms.resolve({ id: alphaUserIds[0] }, [
			{ roomId: match.chatRoomId!, autoOpen: false, label: "Match" },
		]);

		expect(rooms).toEqual([
			expect.objectContaining({
				autoOpen: false,
				label: "Match",
				messages: null,
			}),
		]);
	});

	test("drops a room the user may not view", async () => {
		const { match } = await setupSqMatch(users);

		const rooms = await RouteChatRooms.resolve({ id: outsiderId() }, [
			{ roomId: match.chatRoomId!, autoOpen: true },
		]);

		expect(rooms).toEqual([]);
	});

	test("drops a room that resolves to nothing", async () => {
		const rooms = await RouteChatRooms.resolve({ id: outsiderId() }, [
			{ roomId: 999_999, autoOpen: true },
		]);

		expect(rooms).toEqual([]);
	});

	test("resolves nothing for a logged out viewer", async () => {
		const { match } = await setupSqMatch(users);

		const rooms = await RouteChatRooms.resolve(undefined, [
			{ roomId: match.chatRoomId!, autoOpen: true },
		]);

		expect(rooms).toEqual([]);
	});
});
