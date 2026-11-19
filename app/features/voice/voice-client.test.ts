import { describe, expect, type Mock, test, vi } from "vitest";
import type { ServerEvent } from "~/features/events/events-types";
import {
	createVoiceClient,
	type VoiceCallParticipant,
	type VoiceRoomState,
} from "./voice-client";
import type { VoicePlatform } from "./voice-constants";
import type { RememberedCall } from "./voice-persisted";

const ROOM_ID = 1;
const OTHER_ROOM_ID = 2;
const MINUTE_MS = 60_000;

const roomState = (
	overrides: Partial<VoiceRoomState> = {},
): VoiceRoomState => ({
	available: true,
	canJoin: true,
	canKick: false,
	userIds: [],
	memberUserIds: [],
	guests: [],
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
	deafened: false,
	...overrides,
});

/** A call handle whose microphone is there (`hasMic`) or can't be had. */
function fakeCallHandle({ hasMic = true }: { hasMic?: boolean } = {}) {
	return {
		setLocalAudio: vi.fn(),
		ensureMic: vi.fn(async (_options: { mayAsk: boolean }) => hasMic),
		leave: vi.fn(async () => {}),
		resumeAudio: vi.fn(),
	};
}

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

/** Grants every join, each with a new voice session id starting from 10. */
function joinsInTurn() {
	let nextSessionId = 10;

	return async (_roomId: number, body: object) =>
		"_action" in body && body._action === "JOIN"
			? joinResult(nextSessionId++)
			: null;
}

function joinRequestCount(
	postRoomAction: Mock<(roomId: number, body: object) => Promise<unknown>>,
) {
	return postRoomAction.mock.calls.filter(
		([, body]) => "_action" in body && body._action === "JOIN",
	).length;
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
		platform: vi.fn((): VoicePlatform => "DESKTOP"),
		playSound: vi.fn(),
		loadMicEnabled: vi.fn(() => false),
		saveMicEnabled: vi.fn(),
		rememberCall: vi.fn(),
		takeRememberedCall: vi.fn((): RememberedCall | null => null),
		isPageReload: vi.fn(() => true),
		now: vi.fn(() => 0),
		wait: vi.fn(async (_ms: number) => {}),
		waitUntilOnline: vi.fn(async () => {}),
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
		const { client, deps, emit } = setup();
		deps.fetchRoom.mockResolvedValue(roomState({ memberUserIds: [5, 6] }));
		await client.loadRoom(ROOM_ID);

		emit({ kind: "voicePresence", roomId: ROOM_ID, userIds: [5, 6] });

		expect(client.getSnapshot().roomsById.get(ROOM_ID)?.userIds).toEqual([
			5, 6,
		]);
		expect(deps.fetchRoom).toHaveBeenCalledTimes(1);
	});

	test("refetches the room when someone from outside it joins the call", async () => {
		const { client, deps, emit } = setup();
		deps.fetchRoom.mockResolvedValue(roomState({ memberUserIds: [5] }));
		await client.loadRoom(ROOM_ID);

		emit({ kind: "voicePresence", roomId: ROOM_ID, userIds: [5, 7] });

		expect(deps.fetchRoom).toHaveBeenCalledTimes(2);
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

		expect(deps.rememberCall).toHaveBeenCalledWith({
			roomId: ROOM_ID,
			at: 0,
			kind: "CLOSED",
		});
	});

	test("a reload rejoins the remembered call", async () => {
		const { client, deps } = setup();
		deps.takeRememberedCall.mockReturnValue({
			roomId: ROOM_ID,
			at: 0,
			kind: "CLOSED",
		});

		await client.rejoinAfterReload();

		expect(client.getSnapshot().call).toMatchObject({
			roomId: ROOM_ID,
			voiceSessionId: 10,
		});
	});

	test("a refused rejoin after a reload ends quietly", async () => {
		const { client, deps } = setup({ postRoomAction: async () => null });
		deps.takeRememberedCall.mockReturnValue({
			roomId: ROOM_ID,
			at: 0,
			kind: "CLOSED",
		});

		await client.rejoinAfterReload();

		expect(client.getSnapshot().call).toBeNull();
		expect(deps.postTelemetry).not.toHaveBeenCalled();
	});

	test.each([
		{ why: "a page coming back long after it closed", reload: true },
		{ why: "a page opened anew rather than reloaded", reload: false },
	])("$why doesn't rejoin", async ({ reload }) => {
		const { client, deps } = setup();
		deps.isPageReload.mockReturnValue(reload);
		deps.takeRememberedCall.mockReturnValue({
			roomId: ROOM_ID,
			at: 0,
			kind: "CLOSED",
		});
		deps.now.mockReturnValue(reload ? MINUTE_MS : 0);

		await client.rejoinAfterReload();

		expect(client.getSnapshot().call).toBeNull();
		expect(deps.postRoomAction).not.toHaveBeenCalled();
	});

	test("hiding the page remembers the call and showing it again forgets it", async () => {
		const { client, deps } = setup();
		await client.join(ROOM_ID);
		deps.now.mockReturnValue(5);

		client.setPageHidden(true);
		expect(deps.rememberCall).toHaveBeenLastCalledWith({
			roomId: ROOM_ID,
			at: 5,
			kind: "HIDDEN",
		});

		client.setPageHidden(false);
		expect(deps.rememberCall).toHaveBeenLastCalledWith(null);
	});

	test("a call moving to another room while the page is hidden is remembered in its new room", async () => {
		const { client, deps } = setup({ postRoomAction: joinsInTurn() });
		await client.join(ROOM_ID);
		client.markConnected("local");
		client.setPageHidden(true);

		await client.follow({ roomIds: [ROOM_ID], targetRoomId: OTHER_ROOM_ID });
		client.markConnected("local-2");

		expect(deps.rememberCall).toHaveBeenLastCalledWith({
			roomId: OTHER_ROOM_ID,
			at: 0,
			kind: "HIDDEN",
		});
	});

	test("leaving while the page is hidden forgets the call", async () => {
		const { client, deps } = setup();
		await client.join(ROOM_ID);
		client.setPageHidden(true);

		await client.leave();

		expect(deps.rememberCall).toHaveBeenLastCalledWith(null);
	});

	test("a page the browser discarded in the background rejoins its call", async () => {
		const { client, deps } = setup();
		deps.isPageReload.mockReturnValue(false);
		deps.takeRememberedCall.mockReturnValue({
			roomId: ROOM_ID,
			at: 0,
			kind: "HIDDEN",
		});
		deps.now.mockReturnValue(10 * MINUTE_MS);

		await client.rejoinAfterReload();

		expect(client.getSnapshot().call).toMatchObject({
			roomId: ROOM_ID,
			voiceSessionId: 10,
		});
	});

	test("a page discarded long ago offers to rejoin its call instead", async () => {
		const { client, deps } = setup();
		deps.takeRememberedCall.mockReturnValue({
			roomId: ROOM_ID,
			at: 0,
			kind: "HIDDEN",
		});
		deps.now.mockReturnValue(60 * MINUTE_MS);

		await client.rejoinAfterReload();

		expect(client.getSnapshot().call).toMatchObject({
			roomId: ROOM_ID,
			status: "DISCONNECTED",
			voiceSessionId: null,
		});
		expect(joinRequestCount(deps.postRoomAction)).toBe(0);

		await client.join(ROOM_ID);

		expect(client.getSnapshot().call).toMatchObject({
			status: "JOINING",
			voiceSessionId: 10,
		});
	});

	test("a page discarded long ago offers nothing when the call can't be joined anymore", async () => {
		const { client, deps } = setup();
		deps.fetchRoom.mockResolvedValue(roomState({ canJoin: false }));
		deps.takeRememberedCall.mockReturnValue({
			roomId: ROOM_ID,
			at: 0,
			kind: "HIDDEN",
		});
		deps.now.mockReturnValue(60 * MINUTE_MS);

		await client.rejoinAfterReload();

		expect(client.getSnapshot().call).toBeNull();
	});

	test("following moves an offered rejoin along without joining", async () => {
		const { client, deps } = setup();
		deps.takeRememberedCall.mockReturnValue({
			roomId: ROOM_ID,
			at: 0,
			kind: "HIDDEN",
		});
		deps.now.mockReturnValue(60 * MINUTE_MS);
		await client.rejoinAfterReload();

		await client.follow({ roomIds: [ROOM_ID], targetRoomId: OTHER_ROOM_ID });

		expect(client.getSnapshot().call).toMatchObject({
			roomId: OTHER_ROOM_ID,
			status: "DISCONNECTED",
		});
		expect(joinRequestCount(deps.postRoomAction)).toBe(0);
	});

	test("leaving reports the leave even when the call object never finishes leaving", async () => {
		const { client, deps } = setup();
		await client.join(ROOM_ID);
		client.registerCallHandle({
			...fakeCallHandle(),
			leave: () => new Promise(() => {}),
		});

		await client.leave();

		expect(deps.postRoomAction).toHaveBeenCalledWith(ROOM_ID, {
			_action: "LEAVE",
			voiceSessionId: 10,
			leaveReason: "LEFT",
		});
	});

	test("unmuting gets the microphone, asking for it, then sends it", async () => {
		const { client } = setup();
		const handle = fakeCallHandle();
		await client.join(ROOM_ID);
		client.registerCallHandle(handle);

		await client.setMicEnabled(true);

		expect(handle.ensureMic).toHaveBeenCalledWith({ mayAsk: true });
		expect(handle.setLocalAudio).toHaveBeenCalledWith(true);
		expect(client.getSnapshot().call?.micEnabled).toBe(true);
	});

	test("unmuting without a microphone to be had stays muted and isn't remembered", async () => {
		const { client, deps } = setup();
		const handle = fakeCallHandle({ hasMic: false });
		await client.join(ROOM_ID);
		client.registerCallHandle(handle);

		await client.setMicEnabled(true);

		expect(handle.setLocalAudio).not.toHaveBeenCalledWith(true);
		expect(client.getSnapshot().call?.micEnabled).toBe(false);
		expect(deps.saveMicEnabled).not.toHaveBeenCalled();
	});

	test("letting go of push to talk while the microphone is still coming keeps it muted", async () => {
		const { client } = setup();
		const handle = fakeCallHandle();
		await client.join(ROOM_ID);
		client.registerCallHandle(handle);
		client.setInputMode("PUSH_TO_TALK");

		const pressing = client.setMicEnabled(true);
		await client.setMicEnabled(false);
		await pressing;

		expect(client.getSnapshot().call?.micEnabled).toBe(false);
	});

	test("deafening mutes the microphone and undeafening restores it", async () => {
		const { client } = setup();
		const handle = fakeCallHandle();
		await client.join(ROOM_ID);
		client.registerCallHandle(handle);
		await client.setMicEnabled(true);

		await client.setDeafened(true);
		expect(handle.setLocalAudio).toHaveBeenLastCalledWith(false);
		expect(client.getSnapshot().call).toMatchObject({
			deafened: true,
			micEnabled: false,
		});

		await client.setDeafened(false);
		expect(handle.setLocalAudio).toHaveBeenLastCalledWith(true);
		expect(client.getSnapshot().call).toMatchObject({
			deafened: false,
			micEnabled: true,
		});
	});

	test("audio the browser holds back deafens the call until undeafening lets it play", async () => {
		const { client } = setup();
		const handle = fakeCallHandle();
		await client.join(ROOM_ID);
		client.registerCallHandle(handle);
		await client.setMicEnabled(true);

		client.setAudioBlocked(true);
		expect(client.getSnapshot().call).toMatchObject({
			deafened: true,
			micEnabled: false,
		});

		await client.setDeafened(false);
		expect(handle.resumeAudio).toHaveBeenCalled();
		expect(client.getSnapshot().call).toMatchObject({
			audioBlocked: false,
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

	test.each([
		{ why: "boosts up to 200%", volume: 1.5, expected: 1.5 },
		{ why: "caps a boost at 200%", volume: 3, expected: 2 },
		{ why: "never goes below silent", volume: -1, expected: 0 },
	])("setting a participant's volume $why", ({ volume, expected }) => {
		const { client } = setup();

		client.setVolume(5, volume);

		expect(client.getSnapshot().volumeByUserId.get(5)).toBe(expected);
	});

	test("muting the own microphone clears the own speaking indicator right away", async () => {
		const { client } = setup();
		await client.join(ROOM_ID);
		client.registerCallHandle(fakeCallHandle());
		client.updateParticipants([
			participant("local", { audioEnabled: true, isLocal: true }),
		]);
		await client.setMicEnabled(true);
		client.setSpeaking("local", true);

		await client.setMicEnabled(false);

		expect(client.getSnapshot().call?.speakingSessionIds).toEqual([]);
	});

	test("a new call restores the open mic choice of the previous one, without asking for the microphone", async () => {
		const { client, deps } = setup();
		const handle = fakeCallHandle();
		deps.loadMicEnabled.mockReturnValue(true);
		await client.join(ROOM_ID);
		client.registerCallHandle(handle);

		client.markConnected("local");

		await vi.waitFor(() =>
			expect(client.getSnapshot().call?.micEnabled).toBe(true),
		);
		expect(handle.ensureMic).toHaveBeenCalledWith({ mayAsk: false });
	});

	test.each([
		{ platform: "ANDROID" as const, holdsMic: true },
		{ platform: "IOS" as const, holdsMic: false },
		{ platform: "DESKTOP" as const, holdsMic: false },
	])(
		"a muted call on $platform holds the microphone: $holdsMic",
		async ({ platform, holdsMic }) => {
			const { client, deps } = setup();
			const handle = fakeCallHandle();
			deps.platform.mockReturnValue(platform);
			await client.join(ROOM_ID);
			client.registerCallHandle(handle);

			client.markConnected("local");

			if (holdsMic) {
				expect(handle.ensureMic).toHaveBeenCalledWith({ mayAsk: false });
			} else {
				expect(handle.ensureMic).not.toHaveBeenCalled();
			}
			expect(handle.setLocalAudio).not.toHaveBeenCalled();
			expect(client.getSnapshot().call?.micEnabled).toBe(false);
		},
	);

	test("a new call stays muted when the microphone can't be had without asking", async () => {
		const { client, deps } = setup();
		const handle = fakeCallHandle({ hasMic: false });
		deps.loadMicEnabled.mockReturnValue(true);
		await client.join(ROOM_ID);
		client.registerCallHandle(handle);

		client.markConnected("local");

		await vi.waitFor(() => expect(handle.ensureMic).toHaveBeenCalled());
		expect(client.getSnapshot().call?.micEnabled).toBe(false);
	});

	test("an input mode picked outside a call is the next call's", async () => {
		const { client } = setup();

		client.setInputMode("PUSH_TO_TALK");
		expect(client.getSnapshot().inputMode).toBe("PUSH_TO_TALK");
		await client.join(ROOM_ID);

		expect(client.getSnapshot().call?.inputMode).toBe("PUSH_TO_TALK");
	});

	test("toggling the open mic is remembered, push to talk isn't", async () => {
		const { client, deps } = setup();
		await client.join(ROOM_ID);
		client.registerCallHandle(fakeCallHandle());

		await client.setMicEnabled(true);
		client.setInputMode("PUSH_TO_TALK");
		await client.setMicEnabled(false);

		expect(deps.saveMicEnabled.mock.calls).toEqual([[true]]);
	});

	test("unmuting the microphone undeafens", async () => {
		const { client } = setup();
		await client.join(ROOM_ID);
		client.registerCallHandle(fakeCallHandle());
		await client.setDeafened(true);

		await client.setMicEnabled(true);

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

	test("someone rejoining with a new connection plays no sounds", async () => {
		const { client, deps } = setup();
		await client.join(ROOM_ID);
		client.updateParticipants([
			participant("local", { isLocal: true, userId: 1 }),
			participant("remote"),
		]);
		client.markConnected("local");
		deps.playSound.mockClear();

		client.updateParticipants([
			participant("local", { isLocal: true, userId: 1 }),
			participant("remote-rejoined"),
		]);

		expect(deps.playSound).not.toHaveBeenCalled();
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

	test("a lost connection leaves the old session and rejoins the room", async () => {
		const { client, deps } = setup({ postRoomAction: joinsInTurn() });
		await client.join(ROOM_ID);
		client.markConnected("local");

		await client.reconnect("connection error");

		expect(deps.postRoomAction).toHaveBeenCalledWith(ROOM_ID, {
			_action: "LEAVE",
			voiceSessionId: 10,
			leaveReason: "CONNECTION_LOST",
		});
		expect(client.getSnapshot().call).toMatchObject({
			status: "RECONNECTING",
			voiceSessionId: 11,
			credentials: { token: "token-11" },
		});

		client.markConnected("local-2");

		expect(client.getSnapshot().call?.status).toBe("CONNECTED");
	});

	test("rejoining after a lost connection keeps the call deafened", async () => {
		const { client } = setup({ postRoomAction: joinsInTurn() });
		await client.join(ROOM_ID);
		client.markConnected("local");
		await client.setDeafened(true);

		await client.reconnect(null);

		expect(client.getSnapshot().call?.deafened).toBe(true);
	});

	test("a lost connection forgets the latency of the old one", async () => {
		const { client } = setup({ postRoomAction: joinsInTurn() });
		await client.join(ROOM_ID);
		client.markConnected("local");
		client.setLatency(40);

		await client.reconnect(null);

		expect(client.getSnapshot().call?.latencyMs).toBeNull();
	});

	test("rejoining after a lost connection waits for the network to come back", async () => {
		const { client, deps } = setup({ postRoomAction: joinsInTurn() });
		await client.join(ROOM_ID);
		client.markConnected("local");
		let goOnline = () => {};
		deps.waitUntilOnline.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					goOnline = resolve;
				}),
		);

		const reconnecting = client.reconnect(null);
		await new Promise((resolve) => setTimeout(resolve));
		expect(joinRequestCount(deps.postRoomAction)).toBe(1);
		expect(deps.postRoomAction).not.toHaveBeenCalledWith(
			ROOM_ID,
			expect.objectContaining({ _action: "LEAVE" }),
		);

		goOnline();
		await reconnecting;

		expect(deps.postRoomAction).toHaveBeenCalledWith(ROOM_ID, {
			_action: "LEAVE",
			voiceSessionId: 10,
			leaveReason: "CONNECTION_LOST",
		});
		expect(client.getSnapshot().call?.voiceSessionId).toBe(11);
	});

	test("a call that fails to connect while rejoining tries again", async () => {
		const { client } = setup({ postRoomAction: joinsInTurn() });
		await client.join(ROOM_ID);
		client.markConnected("local");
		await client.reconnect(null);

		client.markFailed("JOIN_FAILED", "network");

		await vi.waitFor(() =>
			expect(client.getSnapshot().call).toMatchObject({
				status: "RECONNECTING",
				voiceSessionId: 12,
			}),
		);
	});

	test("rejoining gives up when every retry is refused and reports it", async () => {
		let isFirstJoin = true;
		const { client, deps } = setup({
			postRoomAction: async (_roomId, body) => {
				if (!("_action" in body) || body._action !== "JOIN") return null;
				if (!isFirstJoin) return null;
				isFirstJoin = false;
				return joinResult(10);
			},
		});
		await client.join(ROOM_ID);
		client.markConnected("local");

		await client.reconnect("connection error");

		expect(client.getSnapshot().call).toMatchObject({
			status: "FAILED",
			errorKind: "CONNECTION_LOST",
		});
		expect(deps.wait).toHaveBeenCalledTimes(5);
		expect(deps.postTelemetry).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: "ERROR",
				errorKind: "CONNECTION_LOST",
				detail: "connection error",
			}),
		);
	});

	test("a page that comes back long after the connection was lost doesn't rejoin", async () => {
		const { client, deps } = setup({ postRoomAction: joinsInTurn() });
		await client.join(ROOM_ID);
		client.markConnected("local");
		deps.waitUntilOnline.mockImplementation(async () => {
			deps.now.mockReturnValue(10 * 60_000);
		});

		await client.reconnect(null);

		expect(client.getSnapshot().call?.status).toBe("FAILED");
		expect(joinRequestCount(deps.postRoomAction)).toBe(1);
	});

	test("leaving while waiting to rejoin stops the rejoin", async () => {
		const { client, deps } = setup({ postRoomAction: joinsInTurn() });
		await client.join(ROOM_ID);
		client.markConnected("local");
		let goOnline = () => {};
		deps.waitUntilOnline.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					goOnline = resolve;
				}),
		);

		const reconnecting = client.reconnect(null);
		await new Promise((resolve) => setTimeout(resolve));
		await client.leave();
		goOnline();
		await reconnecting;

		expect(client.getSnapshot().call).toBeNull();
		expect(joinRequestCount(deps.postRoomAction)).toBe(1);
		expect(deps.postRoomAction).toHaveBeenCalledWith(ROOM_ID, {
			_action: "LEAVE",
			voiceSessionId: 10,
			leaveReason: "CONNECTION_LOST",
		});
	});

	test("a connection Daily recovers on its own shows as reconnecting meanwhile", async () => {
		const { client } = setup();
		await client.join(ROOM_ID);
		client.markConnected("local");

		client.setConnectionInterrupted(true);
		expect(client.getSnapshot().call?.status).toBe("RECONNECTING");

		client.setConnectionInterrupted(false);
		expect(client.getSnapshot().call?.status).toBe("CONNECTED");
	});
});
