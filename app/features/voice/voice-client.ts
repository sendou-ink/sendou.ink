import type { ServerEvent } from "~/features/events/events-types";
import { logger } from "~/utils/logger";
import { VOICE_TELEMETRY_ROUTE, voiceRoomDataRoute } from "~/utils/urls";
import { eventsClient } from "../events/events-client";
import type {
	VoiceClientErrorKind,
	VoiceInputMode,
	VoiceLeaveReason,
	VoicePlatform,
} from "./voice-constants";

export interface VoiceRoomState {
	available: boolean;
	canJoin: boolean;
	canKick: boolean;
	userIds: number[];
}

export type VoiceCallStatus = "JOINING" | "CONNECTED" | "FAILED";

export interface VoiceCallParticipant {
	userId: number;
	sessionId: string;
	isLocal: boolean;
	audioEnabled: boolean;
}

export interface VoiceCall {
	roomId: number;
	voiceSessionId: number | null;
	/** Set once the server granted the join, the call connects with these. */
	credentials: { roomUrl: string; token: string } | null;
	status: VoiceCallStatus;
	micEnabled: boolean;
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
}

export interface VoiceCallHandle {
	setLocalAudio: (enabled: boolean) => void;
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
}

export interface VoiceClient {
	getSnapshot: () => VoiceSnapshot;
	subscribe: (listener: () => void) => () => void;
	start: () => () => void;
	loadRoom: (roomId: number) => Promise<void>;
	join: (roomId: number) => Promise<void>;
	leave: (reason?: VoiceLeaveReason) => Promise<void>;
	leaveOnPageClose: () => void;
	kick: (roomId: number, userId: number) => Promise<void>;
	setMicEnabled: (enabled: boolean) => void;
	setInputMode: (mode: VoiceInputMode) => void;
	setVolume: (userId: number, volume: number) => void;
	registerCallHandle: (handle: VoiceCallHandle | null) => void;
	markConnected: (dailySessionId: string) => void;
	markFailed: (kind: VoiceClientErrorKind | null, detail: string) => void;
	updateParticipants: (participants: VoiceCallParticipant[]) => void;
	setSpeaking: (sessionId: string, speaking: boolean) => void;
	setAudioBlocked: (blocked: boolean) => void;
	flagError: (kind: VoiceClientErrorKind, detail: string | null) => void;
	resumeAudio: () => void;
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
	};
	let callHandle: VoiceCallHandle | null = null;
	let latestSummary: VoiceTelemetrySummary | null = null;
	const listeners = new Set<() => void>();

	const update = (patch: Partial<VoiceSnapshot>) => {
		snapshot = { ...snapshot, ...patch };
		for (const listener of listeners) listener();
	};

	const updateCall = (patch: Partial<VoiceCall>) => {
		if (!snapshot.call) return;
		update({ call: { ...snapshot.call, ...patch } });
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

		sendSummary(false);
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
		join: async (roomId) => {
			if (
				snapshot.call?.roomId === roomId &&
				snapshot.call.status !== "FAILED"
			) {
				return;
			}
			if (snapshot.call) await leave();

			update({
				pendingFeedback: null,
				call: {
					roomId,
					voiceSessionId: null,
					credentials: null,
					status: "JOINING",
					micEnabled: false,
					inputMode: snapshot.call?.inputMode ?? "OPEN_MIC",
					participants: [],
					speakingSessionIds: [],
					audioBlocked: false,
					errorKind: null,
				},
			});
			latestSummary = null;

			const result = await deps.postRoomAction(roomId, {
				_action: "JOIN",
				platform: deps.platform(),
			});
			if (snapshot.call?.roomId !== roomId) return;

			if (!isJoinResult(result)) {
				updateCall({ status: "FAILED", errorKind: "JOIN_FAILED" });
				reportError("JOIN_FAILED", "join request was refused");
				return;
			}
			updateCall({
				voiceSessionId: result.voiceSessionId,
				credentials: { roomUrl: result.roomUrl, token: result.token },
			});
		},
		leave,
		leaveOnPageClose: () => {
			const call = snapshot.call;
			if (!call?.voiceSessionId) return;

			sendSummary(true);
			deps.beaconRoomAction(call.roomId, {
				_action: "LEAVE",
				voiceSessionId: call.voiceSessionId,
				leaveReason: "PAGE_CLOSED",
			});
		},
		kick: async (roomId, userId) => {
			await deps.postRoomAction(roomId, { _action: "KICK", userId });
		},
		setMicEnabled: (enabled) => {
			if (!snapshot.call) return;
			callHandle?.setLocalAudio(enabled);
			updateCall({ micEnabled: enabled });
		},
		setInputMode: (mode) => {
			if (!snapshot.call) return;
			callHandle?.setLocalAudio(false);
			updateCall({ inputMode: mode, micEnabled: false });
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

			updateCall({ status: "CONNECTED" });
			void deps.postRoomAction(call.roomId, {
				_action: "CONNECTED",
				voiceSessionId: call.voiceSessionId,
				dailySessionId,
			});
		},
		markFailed: (kind, detail) => {
			if (!snapshot.call) return;
			updateCall({ status: "FAILED", errorKind: kind });
			if (kind) reportError(kind, detail);
		},
		updateParticipants: (participants) => updateCall({ participants }),
		setSpeaking: (sessionId, speaking) => {
			const call = snapshot.call;
			if (!call) return;

			const isSpeaking = call.speakingSessionIds.includes(sessionId);
			if (isSpeaking === speaking) return;
			updateCall({
				speakingSessionIds: speaking
					? [...call.speakingSessionIds, sessionId]
					: call.speakingSessionIds.filter((id) => id !== sessionId),
			});
		},
		setAudioBlocked: (blocked) => {
			if (snapshot.call?.audioBlocked === blocked) return;
			updateCall({ audioBlocked: blocked });
		},
		flagError: (kind, detail) => {
			if (snapshot.call?.errorKind === kind) return;
			updateCall({ errorKind: kind });
			reportError(kind, detail);
		},
		resumeAudio: () => {
			callHandle?.resumeAudio();
			updateCall({ audioBlocked: false });
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

function isJoinResult(
	value: unknown,
): value is { roomUrl: string; token: string; voiceSessionId: number } {
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
});
