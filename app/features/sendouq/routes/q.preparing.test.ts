import { beforeEach, describe, expect, test, vi } from "vitest";
import * as SQGroupFactory from "~/db/seed/factories/SQGroupFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import { wrappedAction } from "~/utils/Test";
import { refreshSendouQInstance } from "../core/SendouQ.server";
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
