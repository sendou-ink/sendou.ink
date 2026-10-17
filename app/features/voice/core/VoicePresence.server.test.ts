import { afterEach, beforeEach, describe, expect, test, vi } from "bun:test";
import type * as Daily from "./Daily.server";
import * as VoicePresence from "./VoicePresence.server";

const findPresentUserIds = vi.fn<typeof Daily.findPresentUserIds>();

vi.mock("./Daily.server", () => ({
	findPresentUserIds,
}));

let nextRoomId = 1;
const newRoom = () => ({ roomId: nextRoomId++, participantUserIds: [5, 6] });

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
	findPresentUserIds.mockReset();
});

describe("VoicePresence.reconciledUserIdsOf", () => {
	test("keeps a user who joined while Daily was being asked", async () => {
		const room = newRoom();
		const daily = deferred<number[]>();
		findPresentUserIds.mockReturnValue(daily.promise);

		const reconciling = VoicePresence.reconciledUserIdsOf(room);
		VoicePresence.add(room, 5);
		daily.resolve([]);

		expect(await reconciling).toEqual([5]);
	});

	test("keeps a user Daily doesn't list yet right after joining, until the grace period ends", async () => {
		const room = newRoom();
		findPresentUserIds.mockResolvedValue([]);
		VoicePresence.add(room, 5);

		expect(await VoicePresence.reconciledUserIdsOf(room)).toEqual([5]);

		vi.advanceTimersByTime(60_000);
		expect(await VoicePresence.reconciledUserIdsOf(room)).toEqual([]);
	});

	test("drops a user Daily still lists right after they left", async () => {
		const room = newRoom();
		findPresentUserIds.mockResolvedValue([5, 6]);
		VoicePresence.add(room, 5);
		VoicePresence.remove(room, [5]);

		expect(await VoicePresence.reconciledUserIdsOf(room)).toEqual([6]);
	});

	test("keeps Daily's list when the room emptied during the fetch", async () => {
		const room = newRoom();
		VoicePresence.add(room, 5);
		vi.advanceTimersByTime(60_000);
		const daily = deferred<number[]>();
		findPresentUserIds.mockReturnValue(daily.promise);

		const reconciling = VoicePresence.reconciledUserIdsOf(room);
		VoicePresence.remove(room, [5]);
		daily.resolve([5, 6]);
		await reconciling;

		expect(
			VoicePresence.allOccupiedRooms().find(
				(occupied) => occupied.roomId === room.roomId,
			)?.userIds,
		).toEqual([6]);
	});
});

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});

	return { promise, resolve };
}
