import { beforeEach, describe, expect, test, vi } from "bun:test";
import * as ChatRoomFactory from "~/db/seed/factories/ChatRoomFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as VoiceSessionFactory from "~/db/seed/factories/VoiceSessionFactory";
import { db } from "~/db/sql";
import type * as Daily from "./Daily.server";
import * as VoiceEject from "./VoiceEject.server";
import * as VoicePresence from "./VoicePresence.server";

const ejectUsers = vi.fn<typeof Daily.ejectUsers>(async () => {});

vi.mock("./Daily.server", () => ({
	isConfigured: () => true,
	ejectUsers,
}));

const users = UserFactory.pool();
const leaverId = () => users.id(1);
const stayerId = () => users.id(2);

beforeEach(async () => {
	await users.create(2);
	ejectUsers.mockReset();
});

describe("VoiceEject.ejectUsers", () => {
	test("ends the users' sessions, drops them from presence and ejects them on Daily", async () => {
		const chatRoom = await ChatRoomFactory.create();
		const room = {
			roomId: chatRoom.id,
			participantUserIds: [leaverId(), stayerId()],
		};
		const leaving = await VoiceSessionFactory.create(
			{ userId: leaverId(), roomId: chatRoom.id },
			{ dailySessionId: "daily-1" },
		);
		const staying = await VoiceSessionFactory.create(
			{ userId: stayerId(), roomId: chatRoom.id },
			{ dailySessionId: "daily-2" },
		);
		VoicePresence.add(room, leaverId());
		VoicePresence.add(room, stayerId());

		await VoiceEject.ejectUsers({ room, userIds: [leaverId()] });

		expect(await leaveReasonOf(leaving.id)).toBe("EJECTED");
		expect(await leaveReasonOf(staying.id)).toBeNull();
		expect(presentUserIds(chatRoom.id)).toEqual([stayerId()]);
		expect(ejectUsers).toHaveBeenCalledWith({
			chatRoomId: chatRoom.id,
			userIds: [leaverId()],
			ban: false,
		});
	});

	test("a failing Daily request doesn't fail the caller", async () => {
		const chatRoom = await ChatRoomFactory.create();
		ejectUsers.mockRejectedValue(new Error("Daily is down"));

		await expect(
			VoiceEject.ejectUsers({
				room: { roomId: chatRoom.id, participantUserIds: [leaverId()] },
				userIds: [leaverId()],
			}),
		).resolves.toBeUndefined();
	});
});

async function leaveReasonOf(sessionId: number) {
	const row = await db
		.selectFrom("VoiceSession")
		.select("VoiceSession.leaveReason")
		.where("VoiceSession.id", "=", sessionId)
		.executeTakeFirstOrThrow();

	return row.leaveReason;
}

function presentUserIds(roomId: number) {
	return (
		VoicePresence.allOccupiedRooms().find((room) => room.roomId === roomId)
			?.userIds ?? []
	);
}
