import { beforeEach, describe, expect, test } from "vitest";
import * as SQGroupFactory from "~/db/seed/factories/SQGroupFactory";
import * as SQMatchFactory from "~/db/seed/factories/SQMatchFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import { refreshSendouQInstance } from "~/features/sendouq/core/SendouQ.server";
import type { SerializeFrom } from "~/utils/remix";
import { wrappedLoader } from "~/utils/Test";
import { loader } from "./q.match.$id.server";

const users = UserFactory.pool();

// ADMIN_ID is 1 under NODE_ENV=test, so the first pool user is site staff
const staffId = () => users.id(1);
const outsiderId = () => users.id(10);
const alphaUserIds = () => [users.id(2), users.id(3), users.id(4), users.id(5)];
const bravoUserIds = () => [users.id(6), users.id(7), users.id(8), users.id(9)];

const matchLoader = wrappedLoader<SerializeFrom<typeof loader>>({ loader });

describe("q match loader", () => {
	beforeEach(async () => {
		await users.create(10);
	});

	const createMatch = (options: { isConcluded?: boolean } = {}) =>
		SQMatchFactory.create(
			{
				alphaUserIds: alphaUserIds(),
				bravoUserIds: bravoUserIds(),
			},
			options,
		);

	const groupChatRoomId = async (groupId: number) =>
		(
			await db
				.selectFrom("Group")
				.select("Group.chatRoomId")
				.where("Group.id", "=", groupId)
				.executeTakeFirstOrThrow()
		).chatRoomId;

	const loadAs = (userId: number, matchId: number) =>
		matchLoader({ user: userId, params: { id: String(matchId) } });

	const surfacedRooms = (data: Awaited<ReturnType<typeof loadAs>>) =>
		data.chatRooms.map(({ room, autoOpen, label }) => ({
			roomId: room.id,
			autoOpen,
			label,
		}));

	test("surfaces both group chats read-only to staff outside the match", async () => {
		const match = await createMatch();

		const data = await loadAs(staffId(), match.id);

		expect(surfacedRooms(data)).toEqual([
			{ roomId: match.chatRoomId, autoOpen: true },
			{
				roomId: await groupChatRoomId(match.alphaGroup.id),
				autoOpen: false,
				label: "Group Alpha",
			},
			{
				roomId: await groupChatRoomId(match.bravoGroup.id),
				autoOpen: false,
				label: "Group Bravo",
			},
		]);
		// only the room opening on arrival brings its history along
		expect(data.chatRooms.map((entry) => entry.messages !== null)).toEqual([
			true,
			false,
			false,
		]);
	});

	test("gives a participant the match chat and their own group chat only", async () => {
		const match = await createMatch();

		const data = await loadAs(alphaUserIds()[0], match.id);

		expect(surfacedRooms(data)).toEqual([
			{ roomId: match.chatRoomId, autoOpen: true },
			{
				roomId: await groupChatRoomId(match.alphaGroup.id),
				autoOpen: true,
			},
		]);
	});

	test("gives an outsider no chat rooms at all", async () => {
		const match = await createMatch();

		const data = await loadAs(outsiderId(), match.id);

		expect(data.chatRooms).toEqual([]);
	});

	describe("requeueing with the same group", () => {
		const queueElsewhere = async (userId: number) => {
			await SQGroupFactory.create({ memberUserIds: [userId] });
			await refreshSendouQInstance();
		};

		test("offers the requeue while every member is free of other groups", async () => {
			const match = await createMatch({ isConcluded: true });
			await refreshSendouQInstance();

			const data = await loadAs(alphaUserIds()[0], match.id);

			expect(data.hasJoinedNewGroup).toBe(false);
			expect(data.someGroupMemberHasJoinedNewGroup).toBe(false);
		});

		test("points the member who queued elsewhere to their new group", async () => {
			const match = await createMatch({ isConcluded: true });
			await queueElsewhere(alphaUserIds()[1]);

			const data = await loadAs(alphaUserIds()[1], match.id);

			expect(data.hasJoinedNewGroup).toBe(true);
		});

		test("blocks the requeue for the rest of the group too", async () => {
			const match = await createMatch({ isConcluded: true });
			await queueElsewhere(alphaUserIds()[1]);

			const data = await loadAs(alphaUserIds()[0], match.id);

			expect(data.hasJoinedNewGroup).toBe(false);
			expect(data.someGroupMemberHasJoinedNewGroup).toBe(true);
		});

		test("leaves the other group's requeue alone", async () => {
			const match = await createMatch({ isConcluded: true });
			await queueElsewhere(alphaUserIds()[1]);

			const data = await loadAs(bravoUserIds()[0], match.id);

			expect(data.hasJoinedNewGroup).toBe(false);
			expect(data.someGroupMemberHasJoinedNewGroup).toBe(false);
		});
	});
});
