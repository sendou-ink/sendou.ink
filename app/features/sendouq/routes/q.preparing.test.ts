import { beforeEach, describe, expect, test, vi } from "vitest";
import * as FriendshipFactory from "~/db/seed/factories/FriendshipFactory";
import * as LobbyFactory from "~/db/seed/factories/LobbyFactory";
import * as SQGroupFactory from "~/db/seed/factories/SQGroupFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import * as LobbyActivity from "~/features/lobbies/core/LobbyActivity.server";
import { assertResponseErrored, wrappedAction } from "~/utils/Test";
import { refreshSendouQInstance, SendouQ } from "../core/SendouQ.server";
import type { lookingSchema, preparingSchema } from "../q-action-schemas";
import { sqGroupChannel } from "../q-constants";
import { action as rawLookingAction } from "./q.looking";
import { action as rawPreparingAction } from "./q.preparing";

vi.mock("~/features/chat/ChatSystemMessage.server", () => ({
	send: vi.fn(),
	sendPersisted: vi.fn(),
	notifyStatusChanged: vi.fn(),
	notifyNotificationsChanged: vi.fn(),
	notifyRoomsChanged: vi.fn(),
}));

const preparingAction = wrappedAction<typeof preparingSchema>({
	action: rawPreparingAction,
});
const lookingAction = wrappedAction<typeof lookingSchema>({
	action: rawLookingAction,
});

const users = UserFactory.pool();
const actorId = () => users.id(1);
const friendId = () => users.id(2);

const preparingGroup = async () => {
	const group = await SQGroupFactory.create({
		status: "PREPARING",
		memberUserIds: users.ids(),
	});
	await refreshSendouQInstance();

	return group;
};

describe("SendouQ preparing page", () => {
	beforeEach(async () => {
		await users.create(2);
		vi.mocked(ChatSystemMessage.send).mockClear();
	});

	test("joining the queue refreshes the other members' preparing page", async () => {
		const group = await preparingGroup();

		await preparingAction({ _action: "JOIN_QUEUE" }, { user: actorId() });

		expect(ChatSystemMessage.send).toHaveBeenCalledWith(
			expect.arrayContaining([{ channel: sqGroupChannel(group.id) }]),
		);
	});

	test("leaving the group refreshes the other members' preparing page", async () => {
		const group = await preparingGroup();

		await lookingAction({ _action: "LEAVE_GROUP" }, { user: actorId() }).catch(
			() => undefined,
		);

		expect(ChatSystemMessage.send).toHaveBeenCalledWith({
			channel: sqGroupChannel(group.id),
		});
	});
});

describe("ADD_FRIEND", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	const actorPreparingAlone = async () => {
		await SQGroupFactory.create({
			status: "PREPARING",
			memberUserIds: [actorId()],
		});
		await refreshSendouQInstance();
	};

	test("adds a friend to the group", async () => {
		await FriendshipFactory.create({
			userOneId: actorId(),
			userTwoId: friendId(),
		});
		await actorPreparingAlone();

		await preparingAction(
			{ _action: "ADD_FRIEND", id: friendId() },
			{ user: actorId() },
		);

		expect(SendouQ.findOwnGroup(friendId())).toBeDefined();
	});

	test("doesn't add a friend who is checked in to a lobby", async () => {
		await FriendshipFactory.create({
			userOneId: actorId(),
			userTwoId: friendId(),
		});
		await LobbyFactory.create(
			{ hostUserId: friendId() },
			{ checkedInUserIds: [friendId()] },
		);
		await LobbyActivity.refresh();
		await actorPreparingAlone();

		const response = await preparingAction(
			{ _action: "ADD_FRIEND", id: friendId() },
			{ user: actorId() },
		);

		assertResponseErrored(response, "is in a lobby");
		expect(SendouQ.findOwnGroup(friendId())).toBeUndefined();
	});

	test("doesn't add a friend with a new account who set their friend code under a day ago", async () => {
		const newAccountFriend = await UserFactory.create({
			discordId: discordIdCreatedAt(new Date()),
		});
		await FriendshipFactory.create({
			userOneId: actorId(),
			userTwoId: newAccountFriend.id,
		});
		await actorPreparingAlone();

		const response = await preparingAction(
			{ _action: "ADD_FRIEND", id: newAccountFriend.id },
			{ user: actorId() },
		);

		assertResponseErrored(response, "can't join the queue yet");
		expect(SendouQ.findOwnGroup(newAccountFriend.id)).toBeUndefined();
	});
});

function discordIdCreatedAt(date: Date) {
	const DISCORD_EPOCH_MS = 1420070400000n;

	return String((BigInt(date.getTime()) - DISCORD_EPOCH_MS) << 22n);
}
