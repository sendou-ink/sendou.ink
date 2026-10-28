import { describe, expect, test, vi } from "vitest";
import type { ServerEvent } from "~/features/events/events-types";
import {
	createVoiceClient,
	type VoiceCallParticipant,
	type VoiceRoomState,
} from "./voice-client";

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

const participant = (
	sessionId: string,
	overrides: Partial<VoiceCallParticipant> = {},
): VoiceCallParticipant => ({
	userId: 5,
	sessionId,
	isLocal: false,
	audioEnabled: true,
	...overrides,
});

function pendingJoins() {
	const resolvers: Array<(result: unknown) => void> = [];
	let sentCount = 0;

	return {
		postRoomAction: (_roomId: number, body: object) => {
			if (!("_action" in body) || body._action !== "JOIN") {
				return Promise.resolve(null);
			}
			sentCount++;
			return new Promise<unknown>((resolve) => resolvers.push(resolve));
		},
		sentCount: () => sentCount,
		sent: (count: number) => vi.waitFor(() => expect(sentCount).toBe(count)),
		resolveNext: async (result: unknown) => {
			resolvers.shift()!(result);
			await new Promise((resolve) => setTimeout(resolve));
		},
	};
}

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
		playSound: vi.fn(),
		loadMicEnabled: vi.fn(() => false),
		saveMicEnabled: vi.fn(),
		rememberCallForReload: vi.fn(),
		takeCallToRejoin: vi.fn((): number | null => null),
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

	test("following moves a call in one of the rooms to the target", async () => {
		const { client } = setup();
		await client.join(ROOM_ID);

		await client.follow({
			roomIds: [ROOM_ID, OTHER_ROOM_ID],
			targetRoomId: OTHER_ROOM_ID,
		});

		expect(client.getSnapshot().call?.roomId).toBe(OTHER_ROOM_ID);
	});

	test("following leaves a call in an unrelated room alone", async () => {
		const { client } = setup();
		await client.join(ROOM_ID);

		await client.follow({
			roomIds: [OTHER_ROOM_ID],
			targetRoomId: OTHER_ROOM_ID,
		});

		expect(client.getSnapshot().call?.roomId).toBe(ROOM_ID);
	});

	test("following starts no call", async () => {
		const { client, deps } = setup();

		await client.follow({ roomIds: [ROOM_ID], targetRoomId: ROOM_ID });

		expect(deps.postRoomAction).not.toHaveBeenCalled();
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

	test("leaving while the join is in flight ends the session the server started", async () => {
		const joins = pendingJoins();
		const { client, deps } = setup({ postRoomAction: joins.postRoomAction });

		void client.join(ROOM_ID);
		await joins.sent(1);
		await client.leave();
		await joins.resolveNext(joinResult(10));

		expect(deps.postRoomAction).toHaveBeenCalledWith(ROOM_ID, {
			_action: "LEAVE",
			voiceSessionId: 10,
			leaveReason: "LEFT",
		});
		expect(client.getSnapshot().call).toBeNull();
	});

	test("rejoining while the earlier join is in flight waits for it and keeps only its own session", async () => {
		const joins = pendingJoins();
		const { client, deps } = setup({ postRoomAction: joins.postRoomAction });

		void client.join(ROOM_ID);
		await joins.sent(1);
		await client.leave();
		const rejoin = client.join(ROOM_ID);
		await new Promise((resolve) => setTimeout(resolve));
		expect(joins.sentCount()).toBe(1);

		await joins.resolveNext(joinResult(10));
		await joins.sent(2);
		await joins.resolveNext(joinResult(11));
		await rejoin;

		expect(deps.postRoomAction).toHaveBeenCalledWith(ROOM_ID, {
			_action: "LEAVE",
			voiceSessionId: 10,
			leaveReason: "LEFT",
		});
		expect(client.getSnapshot().call).toMatchObject({
			voiceSessionId: 11,
			credentials: { token: "token-11" },
		});
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

	test("closing the page remembers the call for a reload to rejoin", async () => {
		const { client, deps } = setup();
		await client.join(ROOM_ID);

		client.leaveOnPageClose();

		expect(deps.rememberCallForReload).toHaveBeenCalledWith(ROOM_ID);
	});

	test("a reload rejoins the remembered call", async () => {
		const { client, deps } = setup();
		deps.takeCallToRejoin.mockReturnValue(ROOM_ID);

		await client.rejoinAfterReload();

		expect(client.getSnapshot().call).toMatchObject({
			roomId: ROOM_ID,
			voiceSessionId: 10,
		});
	});

	test("a refused rejoin after a reload ends quietly", async () => {
		const { client, deps } = setup({ postRoomAction: async () => null });
		deps.takeCallToRejoin.mockReturnValue(ROOM_ID);

		await client.rejoinAfterReload();

		expect(client.getSnapshot().call).toBeNull();
		expect(deps.postTelemetry).not.toHaveBeenCalled();
	});

	test("leaving reports the leave even when the call object never finishes leaving", async () => {
		const { client, deps } = setup();
		await client.join(ROOM_ID);
		client.registerCallHandle({
			setLocalAudio: () => {},
			leave: () => new Promise(() => {}),
			resumeAudio: () => {},
		});

		await client.leave();

		expect(deps.postRoomAction).toHaveBeenCalledWith(ROOM_ID, {
			_action: "LEAVE",
			voiceSessionId: 10,
			leaveReason: "LEFT",
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

	test("deafening mutes the microphone and undeafening restores it", async () => {
		const { client } = setup();
		const setLocalAudio = vi.fn();
		await client.join(ROOM_ID);
		client.registerCallHandle({
			setLocalAudio,
			leave: async () => {},
			resumeAudio: () => {},
		});
		client.setMicEnabled(true);

		client.setDeafened(true);
		expect(setLocalAudio).toHaveBeenLastCalledWith(false);
		expect(client.getSnapshot().call).toMatchObject({
			deafened: true,
			micEnabled: false,
		});

		client.setDeafened(false);
		expect(setLocalAudio).toHaveBeenLastCalledWith(true);
		expect(client.getSnapshot().call).toMatchObject({
			deafened: false,
			micEnabled: true,
		});
	});

	test("a participant who mutes mid-sentence stops speaking", async () => {
		const { client } = setup();
		await client.join(ROOM_ID);
		client.updateParticipants([participant("remote", { audioEnabled: true })]);
		client.setSpeaking("remote", true);

		client.updateParticipants([participant("remote", { audioEnabled: false })]);
		client.setSpeaking("remote", true);

		expect(client.getSnapshot().call?.speakingSessionIds).toEqual([]);
	});

	test("muting the own microphone clears the own speaking indicator right away", async () => {
		const { client } = setup();
		await client.join(ROOM_ID);
		client.updateParticipants([
			participant("local", { audioEnabled: true, isLocal: true }),
		]);
		client.setMicEnabled(true);
		client.setSpeaking("local", true);

		client.setMicEnabled(false);

		expect(client.getSnapshot().call?.speakingSessionIds).toEqual([]);
	});

	test("a new call restores the open mic choice of the previous one", async () => {
		const { client, deps } = setup();
		const setLocalAudio = vi.fn();
		deps.loadMicEnabled.mockReturnValue(true);
		await client.join(ROOM_ID);
		client.registerCallHandle({
			setLocalAudio,
			leave: async () => {},
			resumeAudio: () => {},
		});

		client.markConnected("local");

		expect(setLocalAudio).toHaveBeenCalledWith(true);
		expect(client.getSnapshot().call?.micEnabled).toBe(true);
	});

	test("toggling the open mic is remembered, push to talk isn't", async () => {
		const { client, deps } = setup();
		await client.join(ROOM_ID);

		client.setMicEnabled(true);
		client.setInputMode("PUSH_TO_TALK");
		client.setMicEnabled(false);

		expect(deps.saveMicEnabled.mock.calls).toEqual([[true]]);
	});

	test("unmuting the microphone undeafens", async () => {
		const { client } = setup();
		await client.join(ROOM_ID);
		client.setDeafened(true);

		client.setMicEnabled(true);

		expect(client.getSnapshot().call).toMatchObject({
			deafened: false,
			micEnabled: true,
		});
	});

	test("connecting plays the join sound once, not for everyone already in the call", async () => {
		const { client, deps } = setup();
		await client.join(ROOM_ID);
		client.updateParticipants([
			participant("local", { isLocal: true }),
			participant("remote-1"),
			participant("remote-2"),
		]);

		client.markConnected("local");

		expect(deps.playSound).toHaveBeenCalledTimes(1);
		expect(deps.playSound).toHaveBeenCalledWith("voice_join");
	});

	test("others joining and leaving the call play their sounds", async () => {
		const { client, deps } = setup();
		await client.join(ROOM_ID);
		client.updateParticipants([participant("local", { isLocal: true })]);
		client.markConnected("local");
		deps.playSound.mockClear();

		client.updateParticipants([
			participant("local", { isLocal: true }),
			participant("remote"),
		]);
		client.updateParticipants([participant("local", { isLocal: true })]);

		expect(deps.playSound.mock.calls).toEqual([
			["voice_join"],
			["voice_leave"],
		]);
	});

	test("leaving a connected call plays the leave sound, a call that never connected doesn't", async () => {
		const { client, deps } = setup();
		await client.join(ROOM_ID);
		await client.leave();
		expect(deps.playSound).not.toHaveBeenCalled();

		await client.join(ROOM_ID);
		client.markConnected("local");
		deps.playSound.mockClear();
		await client.leave();

		expect(deps.playSound).toHaveBeenCalledWith("voice_leave");
	});
});
