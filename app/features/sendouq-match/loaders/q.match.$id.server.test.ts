import { beforeEach, describe, expect, test } from "vitest";
import * as SQMatchFactory from "~/db/seed/factories/SQMatchFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
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

	const createMatch = () =>
		SQMatchFactory.create({
			alphaUserIds: alphaUserIds(),
			bravoUserIds: bravoUserIds(),
		});

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

	test("surfaces both group chats read-only to staff outside the match", async () => {
		const match = await createMatch();

		const data = await loadAs(staffId(), match.id);

		expect(data.chatRooms).toEqual([
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
	});

	test("gives a participant the match chat and their own group chat only", async () => {
		const match = await createMatch();

		const data = await loadAs(alphaUserIds()[0], match.id);

		expect(data.chatRooms).toEqual([
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
});
