import { describe, expect, test, vi } from "vitest";
import type { ServerEvent } from "~/features/events/events-types";
import { createVoiceClient, type VoiceRoomState } from "./voice-client";

const ROOM_ID = 1;
const OTHER_ROOM_ID = 2;

const roomState = (
	overrides: Partial<VoiceRoomState> = {},
): VoiceRoomState => ({
	available: true,
	canJoin: true,
	canKick: false,
	userIds: [],
	...overrides,
});

const joinResult = (voiceSessionId: number) => ({
	roomUrl: "https://sendou.daily.co/chat-1",
	token: `token-${voiceSessionId}`,
	voiceSessionId,
});

function setup({
	postRoomAction = vi.fn(async (_roomId: number, body: object) =>
		"_action" in body && body._action === "JOIN" ? joinResult(10) : null,
	),
}: {
	postRoomAction?: (roomId: number, body: object) => Promise<unknown>;
} = {}) {
	const serverListeners = new Set<(event: ServerEvent) => void>();
	const deps = {
		fetchRoom: vi.fn(async () => roomState()),
		postRoomAction: vi.fn(postRoomAction),
		beaconRoomAction: vi.fn(),
		postTelemetry: vi.fn(async () => {}),
		beaconTelemetry: vi.fn(),
		addServerEventListener: (listener: (event: ServerEvent) => void) => {
			serverListeners.add(listener);
			return () => serverListeners.delete(listener);
		},
		platform: () => "DESKTOP" as const,
	};
	const client = createVoiceClient(deps);
	client.start();

	const emit = (event: ServerEvent) => {
		for (const listener of serverListeners) listener(event);
	};

	return { client, deps, emit };
}

describe("createVoiceClient", () => {
	test("applies presence events to loaded rooms", async () => {
		const { client, emit } = setup();
		await client.loadRoom(ROOM_ID);

		emit({ kind: "voicePresence", roomId: ROOM_ID, userIds: [5, 6] });

		expect(client.getSnapshot().roomsById.get(ROOM_ID)?.userIds).toEqual([
			5, 6,
		]);
	});

	test("ignores presence events of rooms it never loaded", () => {
		const { client, emit } = setup();

		emit({ kind: "voicePresence", roomId: ROOM_ID, userIds: [5] });

		expect(client.getSnapshot().roomsById.size).toBe(0);
	});

	test("joining hands the granted credentials to the call", async () => {
		const { client, deps } = setup();

		await client.join(ROOM_ID);

		expect(deps.postRoomAction).toHaveBeenCalledWith(ROOM_ID, {
			_action: "JOIN",
			platform: "DESKTOP",
		});
		expect(client.getSnapshot().call).toMatchObject({
			roomId: ROOM_ID,
			voiceSessionId: 10,
			status: "JOINING",
			credentials: { token: "token-10" },
		});
	});

	test("a refused join fails the call and reports it", async () => {
		const { client, deps } = setup({ postRoomAction: async () => null });

		await client.join(ROOM_ID);

		expect(client.getSnapshot().call?.status).toBe("FAILED");
		expect(deps.postTelemetry).toHaveBeenCalledWith(
			expect.objectContaining({ kind: "ERROR", errorKind: "JOIN_FAILED" }),
		);
	});

	test("joining another room leaves the current call first", async () => {
		const { client, deps } = setup();
		await client.join(ROOM_ID);

		await client.join(OTHER_ROOM_ID);

		expect(deps.postRoomAction).toHaveBeenCalledWith(ROOM_ID, {
			_action: "LEAVE",
			voiceSessionId: 10,
			leaveReason: "LEFT",
		});
		expect(client.getSnapshot().call?.roomId).toBe(OTHER_ROOM_ID);
	});

	test("leaving asks for feedback when the server wants it, then sends the answer", async () => {
		const { client, deps } = setup({
			postRoomAction: async (_roomId, body) =>
				"_action" in body && body._action === "JOIN"
					? joinResult(10)
					: { askFeedback: true },
		});
		await client.join(ROOM_ID);

		await client.leave();
		expect(client.getSnapshot().pendingFeedback).toEqual({
			roomId: ROOM_ID,
			voiceSessionId: 10,
		});

		await client.submitFeedback({ rating: 4, comment: null });
		expect(deps.postTelemetry).toHaveBeenCalledWith({
			kind: "FEEDBACK",
			voiceSessionId: 10,
			rating: 4,
			comment: null,
		});
		expect(client.getSnapshot().pendingFeedback).toBeNull();
	});

	test("closing the page reports the leave and the latest totals by beacon", async () => {
		const { client, deps } = setup();
		await client.join(ROOM_ID);
		client.setSummary({ lowQualitySeconds: 3, talkSeconds: 40 });

		client.leaveOnPageClose();

		expect(deps.beaconRoomAction).toHaveBeenCalledWith(ROOM_ID, {
			_action: "LEAVE",
			voiceSessionId: 10,
			leaveReason: "PAGE_CLOSED",
		});
		expect(deps.beaconTelemetry).toHaveBeenCalledWith({
			kind: "SUMMARY",
			voiceSessionId: 10,
			inputMode: "OPEN_MIC",
			lowQualitySeconds: 3,
			talkSeconds: 40,
		});
	});

	test("the microphone follows the controls through the call handle", async () => {
		const { client } = setup();
		const setLocalAudio = vi.fn();
		await client.join(ROOM_ID);
		client.registerCallHandle({
			setLocalAudio,
			leave: async () => {},
			resumeAudio: () => {},
		});

		client.setMicEnabled(true);

		expect(setLocalAudio).toHaveBeenCalledWith(true);
		expect(client.getSnapshot().call?.micEnabled).toBe(true);
	});
});
