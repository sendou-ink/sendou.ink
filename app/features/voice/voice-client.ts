import * as v from "valibot";
import type { ServerEvent } from "~/features/events/events-types";
import * as PersistedState from "~/modules/persisted-state/persisted-state";
import { logger } from "~/utils/logger";
import { VOICE_TELEMETRY_ROUTE, voiceRoomDataRoute } from "~/utils/urls";
import * as Sounds from "../chat/core/Sounds";
import { eventsClient } from "../events/events-client";
import {
	VOICE_JOIN_SOUND,
	VOICE_LEAVE_SOUND,
	type VoiceClientErrorKind,
	type VoiceInputMode,
	type VoiceLeaveReason,
	type VoicePlatform,
} from "./voice-constants";
import { voiceSettingsPersisted } from "./voice-persisted";

const REJOIN_AFTER_RELOAD_WINDOW_MS = 30_000;
const RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 20_000];
const RECONNECT_GIVE_UP_MS = 2 * 60_000;

const callToRejoinPersisted = PersistedState.define({
	key: "voiceCallToRejoin",
	storage: "session",
	schema: v.nullable(v.object({ roomId: v.number(), leftAt: v.number() })),
	default: null,
});

const micEnabledPersisted = PersistedState.define({
	key: "voiceMicEnabled",
	storage: "local",
	schema: v.boolean(),
	default: false,
});

export interface VoiceRoomState {
	available: boolean;
	canJoin: boolean;
	canKick: boolean;
	userIds: number[];
}

export type VoiceCallStatus =
	| "JOINING"
	| "CONNECTED"
	| "RECONNECTING"
	| "FAILED";

export interface VoiceCallParticipant {
	userId: number;
	sessionId: string;
	isLocal: boolean;
	audioEnabled: boolean;
	deafened: boolean;
}

export interface VoiceCall {
	roomId: number;
	voiceSessionId: number | null;
	/** Set once the server granted the join, the call connects with these. */
	credentials: { roomUrl: string; token: string } | null;
	status: VoiceCallStatus;
	micEnabled: boolean;
	deafened: boolean;
	inputMode: VoiceInputMode;
	participants: VoiceCallParticipant[];
	speakingSessionIds: string[];
	audioBlocked: boolean;
	errorKind: VoiceClientErrorKind | null;
}

export interface VoiceSnapshot {
	roomsById: ReadonlyMap<number, VoiceRoomState>;
	call: VoiceCall | null;
	volumeByUserId: ReadonlyMap<number, number>;
	pendingFeedback: { roomId: number; voiceSessionId: number } | null;
	inputMode: VoiceInputMode;
}

export interface VoiceCallHandle {
	setLocalAudio: (enabled: boolean) => void;
	ensureMic: (options: { mayAsk: boolean }) => Promise<boolean>;
	leave: () => Promise<void>;
	resumeAudio: () => void;
}

export interface VoiceTelemetrySummary {
	lowQualitySeconds: number;
	talkSeconds: number;
}

interface VoiceClientDeps {
	fetchRoom: (roomId: number) => Promise<VoiceRoomState | null>;
	postRoomAction: (roomId: number, body: object) => Promise<unknown>;
	beaconRoomAction: (roomId: number, body: object) => void;
	postTelemetry: (body: object) => Promise<void>;
	beaconTelemetry: (body: object) => void;
	addServerEventListener: (
		listener: (event: ServerEvent) => void,
	) => () => void;
	platform: () => VoicePlatform;
	playSound: (soundCode: string) => void;
	loadMicEnabled: () => boolean;
	saveMicEnabled: (enabled: boolean) => void;
	rememberCallForReload: (roomId: number) => void;
	takeCallToRejoin: () => number | null;
	now: () => number;
	wait: (ms: number) => Promise<void>;
	waitUntilOnline: () => Promise<void>;
}

type JoinResult = { roomUrl: string; token: string; voiceSessionId: number };

export interface VoiceClient {
	getSnapshot: () => VoiceSnapshot;
	subscribe: (listener: () => void) => () => void;
	start: () => () => void;
	loadRoom: (roomId: number) => Promise<void>;
	join: (roomId: number) => Promise<void>;
	/** Moves a call in one of `roomIds` to `targetRoomId`, e.g. when the user's team changes. Starts no call. */
	follow: (args: { roomIds: number[]; targetRoomId: number }) => Promise<void>;
	rejoinAfterReload: () => Promise<void>;
	leave: (reason?: VoiceLeaveReason) => Promise<void>;
	leaveOnPageClose: () => void;
	kick: (roomId: number, userId: number) => Promise<void>;
	setMicEnabled: (enabled: boolean) => Promise<void>;
	setDeafened: (deafened: boolean) => Promise<void>;
	setInputMode: (mode: VoiceInputMode) => void;
	setVolume: (userId: number, volume: number) => void;
	registerCallHandle: (handle: VoiceCallHandle | null) => void;
	markConnected: (dailySessionId: string) => void;
	markFailed: (kind: VoiceClientErrorKind | null, detail: string) => void;
	reconnect: (detail: string | null) => Promise<void>;
	setConnectionInterrupted: (interrupted: boolean) => void;
	updateParticipants: (participants: VoiceCallParticipant[]) => void;
	setSpeaking: (sessionId: string, speaking: boolean) => void;
	setAudioBlocked: (blocked: boolean) => void;
	flagError: (kind: VoiceClientErrorKind, detail: string | null) => void;
	setSummary: (summary: VoiceTelemetrySummary) => void;
	flushSummary: () => void;
	submitFeedback: (feedback: {
		rating: number;
		comment: string | null;
	}) => Promise<void>;
	dismissFeedback: () => void;
}

export function createVoiceClient(deps: VoiceClientDeps): VoiceClient {
	let snapshot: VoiceSnapshot = {
		roomsById: new Map(),
		call: null,
		volumeByUserId: new Map(),
		pendingFeedback: null,
		inputMode: "OPEN_MIC",
	};
	let callHandle: VoiceCallHandle | null = null;
	let latestSummary: VoiceTelemetrySummary | null = null;
	let micEnabledBeforeDeafen = false;
	let micWanted = false;
	let joinAttempt = 0;
	let latestJoinRequest: Promise<unknown> = Promise.resolve();
	let reconnection: {
		lostAt: number;
		retries: number;
		lostVoiceSessionIds: number[];
	} | null = null;
	const listeners = new Set<() => void>();

	const update = (patch: Partial<VoiceSnapshot>) => {
		snapshot = { ...snapshot, ...patch };
		for (const listener of listeners) listener();
	};

	const updateCall = (patch: Partial<VoiceCall>) => {
		if (!snapshot.call) return;
		update({ call: { ...snapshot.call, ...patch } });
	};

	const resumeBlockedAudio = () => {
		if (!snapshot.call?.audioBlocked) return;
		callHandle?.resumeAudio();
		updateCall({ audioBlocked: false });
	};

	const deafen = (call: VoiceCall) => {
		micEnabledBeforeDeafen = call.micEnabled;
		if (call.micEnabled) callHandle?.setLocalAudio(false);
		updateCall({ deafened: true, micEnabled: false, ...silencedLocally(call) });
	};

	const enableMic = async ({ byUser }: { byUser: boolean }) => {
		const attempt = joinAttempt;
		micWanted = true;
		const hasMic = (await callHandle?.ensureMic({ mayAsk: byUser })) ?? false;

		const call = snapshot.call;
		if (!call || attempt !== joinAttempt || !micWanted || !hasMic) {
			return false;
		}
		if (call.deafened && !byUser) {
			micEnabledBeforeDeafen = true;
			return false;
		}

		callHandle?.setLocalAudio(true);
		updateCall({
			micEnabled: true,
			deafened: false,
			errorKind: isMicError(call.errorKind) ? null : call.errorKind,
		});
		return true;
	};

	const setRoom = (roomId: number, room: VoiceRoomState) => {
		const roomsById = new Map(snapshot.roomsById);
		roomsById.set(roomId, room);
		update({ roomsById });
	};

	const sendSummary = (viaBeacon: boolean) => {
		const call = snapshot.call;
		if (!call?.voiceSessionId || !latestSummary) return;

		const body = {
			kind: "SUMMARY",
			voiceSessionId: call.voiceSessionId,
			inputMode: call.inputMode,
			...latestSummary,
		};
		if (viaBeacon) {
			deps.beaconTelemetry(body);
		} else {
			void deps.postTelemetry(body);
		}
	};

	const reportError = (kind: VoiceClientErrorKind, detail: string | null) => {
		void deps.postTelemetry({
			kind: "ERROR",
			voiceSessionId: snapshot.call?.voiceSessionId ?? null,
			errorKind: kind,
			detail: detail?.slice(0, 500) ?? null,
			platform: deps.platform(),
		});
	};

	const leave = async (reason: VoiceLeaveReason = "LEFT") => {
		const call = snapshot.call;
		if (!call) return;

		leaveLostSessions(call.roomId);
		reconnection = null;

		sendSummary(false);
		if (call.status === "CONNECTED") deps.playSound(VOICE_LEAVE_SOUND);
		// not awaited: clearing the call unmounts its call object, whose leave then never settles
		void callHandle?.leave().catch((error) => {
			logger.error("Leaving the voice call failed", error);
		});
		update({ call: null });

		if (!call.voiceSessionId) return;
		const result = await deps.postRoomAction(call.roomId, {
			_action: "LEAVE",
			voiceSessionId: call.voiceSessionId,
			leaveReason: reason,
		});
		if (isAskFeedbackResult(result) && result.askFeedback) {
			update({
				pendingFeedback: {
					roomId: call.roomId,
					voiceSessionId: call.voiceSessionId,
				},
			});
		}
	};

	const join = async (
		roomId: number,
		{ isAutomatic = false }: { isAutomatic?: boolean } = {},
	) => {
		if (snapshot.call?.roomId === roomId && snapshot.call.status !== "FAILED") {
			return;
		}
		if (snapshot.call) await leave();

		reconnection = null;
		const attempt = ++joinAttempt;
		update({
			pendingFeedback: null,
			call: {
				roomId,
				voiceSessionId: null,
				credentials: null,
				status: "JOINING",
				micEnabled: false,
				deafened: false,
				inputMode: snapshot.inputMode,
				participants: [],
				speakingSessionIds: [],
				audioBlocked: false,
				errorKind: null,
			},
		});
		latestSummary = null;

		const result = await requestJoin(roomId, attempt);
		if (result === "SUPERSEDED") return;

		if (!result) {
			if (isAutomatic) {
				update({ call: null });
				return;
			}
			updateCall({ status: "FAILED", errorKind: "JOIN_FAILED" });
			reportError("JOIN_FAILED", "join request was refused");
			return;
		}
		updateCall({
			voiceSessionId: result.voiceSessionId,
			credentials: { roomUrl: result.roomUrl, token: result.token },
		});
	};

	const requestJoin = async (
		roomId: number,
		attempt: number,
	): Promise<JoinResult | null | "SUPERSEDED"> => {
		await latestJoinRequest;
		const isSuperseded = () => attempt !== joinAttempt || !snapshot.call;
		if (isSuperseded()) return "SUPERSEDED";

		const request = deps.postRoomAction(roomId, {
			_action: "JOIN",
			platform: deps.platform(),
		});
		latestJoinRequest = request;
		const result = await request;
		if (isSuperseded()) {
			if (isJoinResult(result)) {
				void deps.postRoomAction(roomId, {
					_action: "LEAVE",
					voiceSessionId: result.voiceSessionId,
					leaveReason: "LEFT",
				});
			}
			return "SUPERSEDED";
		}

		return isJoinResult(result) ? result : null;
	};

	const leaveLostSessions = (roomId: number) => {
		if (!reconnection) return;

		for (const voiceSessionId of reconnection.lostVoiceSessionIds) {
			void deps.postRoomAction(roomId, {
				_action: "LEAVE",
				voiceSessionId,
				leaveReason: "CONNECTION_LOST",
			});
		}
		reconnection.lostVoiceSessionIds = [];
	};

	const reconnect = async (detail: string | null): Promise<void> => {
		const call = snapshot.call;
		if (!call) return;

		const attempt = ++joinAttempt;
		reconnection ??= {
			lostAt: deps.now(),
			retries: 0,
			lostVoiceSessionIds: [],
		};
		const delay = RECONNECT_DELAYS_MS[reconnection.retries++];

		if (call.voiceSessionId) {
			sendSummary(false);
			reconnection.lostVoiceSessionIds.push(call.voiceSessionId);
		}

		void callHandle?.leave().catch((error) => {
			logger.error("Leaving the lost voice call failed", error);
		});
		updateCall({
			status: "RECONNECTING",
			voiceSessionId: null,
			credentials: null,
			micEnabled: false,
			participants: [],
			speakingSessionIds: [],
			audioBlocked: false,
		});
		latestSummary = null;

		const giveUp = () => {
			leaveLostSessions(call.roomId);
			reconnection = null;
			updateCall({ status: "FAILED", errorKind: "CONNECTION_LOST" });
			reportError("CONNECTION_LOST", detail);
		};
		if (delay === undefined) return giveUp();

		await deps.wait(delay);
		await deps.waitUntilOnline();
		if (attempt !== joinAttempt || !snapshot.call || !reconnection) return;
		leaveLostSessions(call.roomId);
		if (deps.now() - reconnection.lostAt > RECONNECT_GIVE_UP_MS) {
			return giveUp();
		}

		const result = await requestJoin(call.roomId, attempt);
		if (result === "SUPERSEDED") return;
		if (!result) return reconnect(detail);

		updateCall({
			voiceSessionId: result.voiceSessionId,
			credentials: { roomUrl: result.roomUrl, token: result.token },
		});
	};

	return {
		getSnapshot: () => snapshot,
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		start: () =>
			deps.addServerEventListener((event) => {
				if (event.kind !== "voicePresence") return;

				const room = snapshot.roomsById.get(event.roomId);
				if (!room) return;
				setRoom(event.roomId, { ...room, userIds: event.userIds });
			}),
		loadRoom: async (roomId) => {
			const room = await deps.fetchRoom(roomId);
			if (room) setRoom(roomId, room);
		},
		join: (roomId) => join(roomId),
		follow: async ({ roomIds, targetRoomId }) => {
			const call = snapshot.call;
			if (!call || call.roomId === targetRoomId) return;
			if (!roomIds.includes(call.roomId)) return;

			await join(targetRoomId);
		},
		rejoinAfterReload: async () => {
			const roomId = deps.takeCallToRejoin();
			if (roomId !== null) await join(roomId, { isAutomatic: true });
		},
		leave,
		leaveOnPageClose: () => {
			const call = snapshot.call;
			if (!call?.voiceSessionId) return;

			sendSummary(true);
			deps.rememberCallForReload(call.roomId);
			deps.beaconRoomAction(call.roomId, {
				_action: "LEAVE",
				voiceSessionId: call.voiceSessionId,
				leaveReason: "PAGE_CLOSED",
			});
		},
		kick: async (roomId, userId) => {
			await deps.postRoomAction(roomId, { _action: "KICK", userId });
		},
		setMicEnabled: async (enabled) => {
			const call = snapshot.call;
			if (!call) return;

			if (!enabled) {
				micWanted = false;
				if (call.inputMode === "OPEN_MIC") deps.saveMicEnabled(false);
				callHandle?.setLocalAudio(false);
				updateCall({ micEnabled: false, ...silencedLocally(call) });
				return;
			}

			resumeBlockedAudio();
			const isEnabled = await enableMic({ byUser: true });
			if (isEnabled && snapshot.call?.inputMode === "OPEN_MIC") {
				deps.saveMicEnabled(true);
			}
		},
		setDeafened: async (deafened) => {
			const call = snapshot.call;
			if (!call || call.deafened === deafened) return;

			if (deafened) {
				deafen(call);
				return;
			}

			resumeBlockedAudio();
			updateCall({ deafened: false });
			if (call.inputMode === "OPEN_MIC" && micEnabledBeforeDeafen) {
				await enableMic({ byUser: true });
			}
		},
		setInputMode: (mode) => {
			if (snapshot.inputMode !== mode) update({ inputMode: mode });
			if (!snapshot.call || snapshot.call.inputMode === mode) return;
			micWanted = false;
			callHandle?.setLocalAudio(false);
			updateCall({
				inputMode: mode,
				micEnabled: false,
				...silencedLocally(snapshot.call),
			});
		},
		setVolume: (userId, volume) => {
			const volumeByUserId = new Map(snapshot.volumeByUserId);
			volumeByUserId.set(userId, Math.min(1, Math.max(0, volume)));
			update({ volumeByUserId });
		},
		registerCallHandle: (handle) => {
			callHandle = handle;
		},
		markConnected: (dailySessionId) => {
			const call = snapshot.call;
			if (!call?.voiceSessionId) return;

			reconnection = null;
			updateCall({ status: "CONNECTED" });

			if (call.inputMode === "OPEN_MIC" && deps.loadMicEnabled()) {
				if (call.deafened) {
					micEnabledBeforeDeafen = true;
				} else {
					void enableMic({ byUser: false });
				}
			}
			deps.playSound(VOICE_JOIN_SOUND);
			void deps.postRoomAction(call.roomId, {
				_action: "CONNECTED",
				voiceSessionId: call.voiceSessionId,
				dailySessionId,
			});
		},
		markFailed: (kind, detail) => {
			if (!snapshot.call) return;
			if (reconnection) {
				void reconnect(detail);
				return;
			}
			updateCall({ status: "FAILED", errorKind: kind });
			if (kind) reportError(kind, detail);
		},
		reconnect,
		setConnectionInterrupted: (interrupted) => {
			const call = snapshot.call;
			if (!call || reconnection) return;

			if (interrupted && call.status === "CONNECTED") {
				updateCall({ status: "RECONNECTING" });
			} else if (!interrupted && call.status === "RECONNECTING") {
				updateCall({ status: "CONNECTED" });
			}
		},
		updateParticipants: (participants) => {
			const call = snapshot.call;
			if (!call) return;

			const mutedSessionIds = participants
				.filter((participant) => !participant.audioEnabled)
				.map((participant) => participant.sessionId);

			const hasBaseline = call.participants.some(
				(participant) => participant.isLocal,
			);
			if (call.status === "CONNECTED" && hasBaseline) {
				const remoteUserIdsOf = (list: VoiceCallParticipant[]) =>
					list
						.filter((participant) => !participant.isLocal)
						.map((participant) => participant.userId);
				const before = remoteUserIdsOf(call.participants);
				const after = remoteUserIdsOf(participants);

				if (after.some((id) => !before.includes(id))) {
					deps.playSound(VOICE_JOIN_SOUND);
				}
				if (before.some((id) => !after.includes(id))) {
					deps.playSound(VOICE_LEAVE_SOUND);
				}
			}
			updateCall({
				participants,
				speakingSessionIds: call.speakingSessionIds.filter(
					(id) => !mutedSessionIds.includes(id),
				),
			});
		},
		setSpeaking: (sessionId, speaking) => {
			const call = snapshot.call;
			if (!call) return;

			const participant = call.participants.find(
				(candidate) => candidate.sessionId === sessionId,
			);
			// audio levels stop arriving once a track is muted
			if (speaking && participant && !participant.audioEnabled) return;

			const isSpeaking = call.speakingSessionIds.includes(sessionId);
			if (isSpeaking === speaking) return;
			updateCall({
				speakingSessionIds: speaking
					? [...call.speakingSessionIds, sessionId]
					: call.speakingSessionIds.filter((id) => id !== sessionId),
			});
		},
		setAudioBlocked: (blocked) => {
			const call = snapshot.call;
			if (!call || call.audioBlocked === blocked) return;

			updateCall({ audioBlocked: blocked });
			if (blocked && !call.deafened) deafen(call);
		},
		flagError: (kind, detail) => {
			if (snapshot.call?.errorKind === kind) return;
			updateCall({ errorKind: kind });
			reportError(kind, detail);
		},
		setSummary: (summary) => {
			latestSummary = summary;
		},
		flushSummary: () => sendSummary(false),
		submitFeedback: async (feedback) => {
			const pending = snapshot.pendingFeedback;
			if (!pending) return;

			update({ pendingFeedback: null });
			await deps.postTelemetry({
				kind: "FEEDBACK",
				voiceSessionId: pending.voiceSessionId,
				...feedback,
			});
		},
		dismissFeedback: () => update({ pendingFeedback: null }),
	};
}

function silencedLocally(
	call: VoiceCall,
): Pick<VoiceCall, "participants" | "speakingSessionIds"> {
	const localSessionId = call.participants.find(
		(participant) => participant.isLocal,
	)?.sessionId;

	return {
		participants: call.participants.map((participant) =>
			participant.isLocal
				? { ...participant, audioEnabled: false }
				: participant,
		),
		speakingSessionIds: call.speakingSessionIds.filter(
			(id) => id !== localSessionId,
		),
	};
}

function isMicError(kind: VoiceClientErrorKind | null) {
	return kind === "MIC_DENIED" || kind === "MIC_NOT_FOUND";
}

function isJoinResult(value: unknown): value is JoinResult {
	return (
		typeof value === "object" &&
		value !== null &&
		"token" in value &&
		"roomUrl" in value &&
		"voiceSessionId" in value
	);
}

function isAskFeedbackResult(
	value: unknown,
): value is { askFeedback: boolean } {
	return typeof value === "object" && value !== null && "askFeedback" in value;
}

function detectPlatform(): VoicePlatform {
	const userAgent = navigator.userAgent;
	if (/iPhone|iPad|iPod/.test(userAgent)) return "IOS";
	// iPadOS reports itself as a Mac
	if (/Macintosh/.test(userAgent) && navigator.maxTouchPoints > 1) return "IOS";
	if (/Android/.test(userAgent)) return "ANDROID";

	return "DESKTOP";
}

async function postJson(url: string, body: object) {
	try {
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		if (!response.ok) return null;

		const text = await response.text();
		return text ? (JSON.parse(text) as unknown) : null;
	} catch (error) {
		logger.error("Voice request failed", error);
		return null;
	}
}

function beacon(url: string, body: object) {
	navigator.sendBeacon(
		url,
		new Blob([JSON.stringify(body)], { type: "application/json" }),
	);
}

export const voiceClient = createVoiceClient({
	fetchRoom: async (roomId) => {
		try {
			const response = await fetch(voiceRoomDataRoute(roomId));
			if (!response.ok) return null;

			return (await response.json()) as VoiceRoomState;
		} catch (error) {
			logger.error("Loading the voice room failed", error);
			return null;
		}
	},
	postRoomAction: (roomId, body) => postJson(voiceRoomDataRoute(roomId), body),
	beaconRoomAction: (roomId, body) => beacon(voiceRoomDataRoute(roomId), body),
	postTelemetry: async (body) => {
		await postJson(VOICE_TELEMETRY_ROUTE, body);
	},
	beaconTelemetry: (body) => beacon(VOICE_TELEMETRY_ROUTE, body),
	addServerEventListener: (listener) => eventsClient.addEventListener(listener),
	platform: detectPlatform,
	playSound: (soundCode) => {
		if (PersistedState.read(voiceSettingsPersisted).sounds) {
			Sounds.playIgnoringSetting(soundCode);
		}
	},
	loadMicEnabled: () => PersistedState.read(micEnabledPersisted),
	saveMicEnabled: (enabled) =>
		PersistedState.write(micEnabledPersisted, enabled),
	rememberCallForReload: (roomId) =>
		PersistedState.write(callToRejoinPersisted, { roomId, leftAt: Date.now() }),
	takeCallToRejoin: () => {
		const remembered = PersistedState.read(callToRejoinPersisted);
		if (!remembered) return null;
		PersistedState.write(callToRejoinPersisted, null);

		return isPageReload() &&
			Date.now() - remembered.leftAt < REJOIN_AFTER_RELOAD_WINDOW_MS
			? remembered.roomId
			: null;
	},
	now: () => Date.now(),
	wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
	waitUntilOnline: () =>
		new Promise((resolve) => {
			if (navigator.onLine) return resolve();
			window.addEventListener("online", () => resolve(), { once: true });
		}),
});

function isPageReload() {
	const [navigation] = performance.getEntriesByType("navigation");

	return (
		navigation instanceof PerformanceNavigationTiming &&
		navigation.type === "reload"
	);
}
