import { beforeEach, describe, expect, test } from "bun:test";
import * as ChatRoomFactory from "~/db/seed/factories/ChatRoomFactory";
import * as SQMatchFactory from "~/db/seed/factories/SQMatchFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as VoiceSessionFactory from "~/db/seed/factories/VoiceSessionFactory";
import { wrappedAction } from "~/utils/Test";
import * as VoicePresence from "../core/VoicePresence.server";
import type { voiceRoomActionSchema } from "../voice-schemas";
import { action } from "./api.voice.rooms.$id";

const voiceRoomAction = wrappedAction<typeof voiceRoomActionSchema>({
	action,
});

const users = UserFactory.pool();
const playerId = () => users.id(1);

beforeEach(async () => {
	await users.create(8);
});

describe("Voice room action", () => {
	test("CONNECTED with a session of another room is refused and adds no presence", async () => {
		const matchRoomId = await createMatchRoom();
		const otherRoom = await ChatRoomFactory.create();
		const session = await VoiceSessionFactory.create({
			userId: playerId(),
			roomId: otherRoom.id,
		});

		await expect(connected(matchRoomId, session.id)).rejects.toThrow("403");

		expect(presentUserIds(matchRoomId)).not.toContain(playerId());
	});

	test("CONNECTED arriving after leaving doesn't put the user back in presence", async () => {
		const matchRoomId = await createMatchRoom();
		const session = await VoiceSessionFactory.create({
			userId: playerId(),
			roomId: matchRoomId,
		});
		await voiceRoomAction(
			{ _action: "LEAVE", voiceSessionId: session.id, leaveReason: "LEFT" },
			{ user: playerId(), params: { id: String(matchRoomId) } },
		);

		await expect(connected(matchRoomId, session.id)).rejects.toThrow("403");

		expect(presentUserIds(matchRoomId)).not.toContain(playerId());
	});

	test("LEAVE with a session of another room is refused", async () => {
		const matchRoomId = await createMatchRoom();
		const otherRoom = await ChatRoomFactory.create();
		const session = await VoiceSessionFactory.create({
			userId: playerId(),
			roomId: otherRoom.id,
		});

		await expect(
			voiceRoomAction(
				{ _action: "LEAVE", voiceSessionId: session.id, leaveReason: "LEFT" },
				{ user: playerId(), params: { id: String(matchRoomId) } },
			),
		).rejects.toThrow("403");
	});
});

async function createMatchRoom() {
	const match = await SQMatchFactory.create({
		alphaUserIds: users.ids(4),
		bravoUserIds: users.ids().slice(4),
	});

	return match.chatRoomId!;
}

function connected(roomId: number, voiceSessionId: number) {
	return voiceRoomAction(
		{ _action: "CONNECTED", voiceSessionId, dailySessionId: "daily-1" },
		{ user: playerId(), params: { id: String(roomId) } },
	);
}

function presentUserIds(roomId: number) {
	return (
		VoicePresence.allOccupiedRooms().find((room) => room.roomId === roomId)
			?.userIds ?? []
	);
}
