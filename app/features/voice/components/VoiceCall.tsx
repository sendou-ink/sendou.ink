import type {
	DailyCall,
	DailyEventObjectCameraError,
	DailyEventObjectFatalError,
} from "@daily-co/daily-js";
import {
	DailyAudioTrack,
	DailyProvider,
	useAudioLevelObserver,
	useCallObject,
	useDaily,
	useDailyEvent,
	useNetwork,
	useParticipantIds,
} from "@daily-co/daily-react";
import * as React from "react";
import { logger } from "~/utils/logger";
import { type VoiceCallParticipant, voiceClient } from "../voice-client";
import { VOICE_TELEMETRY_INTERVAL_MS } from "../voice-constants";
import { useVoiceSnapshot } from "../voice-hooks";

const SPEAKING_LEVEL = 0.04;
const TELEMETRY_TICK_MS = 1_000;

const audioElements = new Set<HTMLAudioElement>();

export function VoiceCall({
	roomId,
	roomUrl,
	token,
}: {
	roomId: number;
	roomUrl: string;
	token: string;
}) {
	const callObject = useCallObject({
		options: {
			audioSource: true,
			videoSource: false,
			startVideoOff: true,
			startAudioOff: true,
			subscribeToTracksAutomatically: true,
		},
	});

	React.useEffect(() => {
		if (!callObject) return;

		callObject.setLocalVideo(false);
		voiceClient.registerCallHandle({
			setLocalAudio: (enabled) => callObject.setLocalAudio(enabled),
			leave: () => callObject.leave(),
			resumeAudio: () => {
				for (const audio of audioElements) {
					void audio.play().catch(() => {});
				}
			},
		});

		callObject
			.join({ url: roomUrl, token, startVideoOff: true, startAudioOff: true })
			.then(() => {
				voiceClient.markConnected(callObject.participants().local.session_id);
			})
			.catch((error: unknown) => {
				logger.error("Joining the voice call failed", error);
				voiceClient.markFailed("JOIN_FAILED", String(error));
			});

		return () => {
			voiceClient.registerCallHandle(null);
			void callObject.leave().catch(() => {});
		};
	}, [callObject, roomUrl, token]);

	if (!callObject) return null;

	return (
		<DailyProvider callObject={callObject}>
			<CallEvents roomId={roomId} />
			<ParticipantsSync />
			<RemoteAudio />
			<Telemetry />
			<ScreenWakeLock />
		</DailyProvider>
	);
}

function CallEvents({ roomId }: { roomId: number }) {
	useDailyEvent(
		"error",
		React.useCallback(
			(event: DailyEventObjectFatalError) => {
				switch (event.error?.type) {
					case "exp-token": {
						void voiceClient.leave("TOKEN_EXPIRED").then(() => {
							if (document.visibilityState === "visible") {
								void voiceClient.join(roomId);
							}
						});
						return;
					}
					case "ejected":
					case "exp-room": {
						void voiceClient.leave("EJECTED");
						return;
					}
					case "connection-error": {
						void voiceClient.leave("CONNECTION_LOST");
						return;
					}
					default: {
						voiceClient.markFailed("JOIN_FAILED", event.errorMsg);
					}
				}
			},
			[roomId],
		),
	);

	useDailyEvent(
		"camera-error",
		React.useCallback((event: DailyEventObjectCameraError) => {
			const { error } = event;
			if (error.type === "permissions") {
				voiceClient.flagError("MIC_DENIED", error.msg);
			} else if (error.type === "not-found") {
				voiceClient.flagError("MIC_NOT_FOUND", error.msg);
			}
		}, []),
	);

	return null;
}

function ParticipantsSync() {
	const daily = useDaily();
	const sessionIds = useParticipantIds();

	const sync = React.useCallback(() => {
		if (daily) voiceClient.updateParticipants(participantsOf(daily));
	}, [daily]);

	useDailyEvent("participant-joined", sync);
	useDailyEvent("participant-updated", sync);
	useDailyEvent("participant-left", sync);
	useDailyEvent("joined-meeting", sync);

	return (
		<>
			{sessionIds.map((sessionId) => (
				<SpeakingObserver key={sessionId} sessionId={sessionId} />
			))}
		</>
	);
}

function SpeakingObserver({ sessionId }: { sessionId: string }) {
	useAudioLevelObserver(
		sessionId,
		React.useCallback(
			(level: number) =>
				voiceClient.setSpeaking(sessionId, level > SPEAKING_LEVEL),
			[sessionId],
		),
	);

	React.useEffect(
		() => () => voiceClient.setSpeaking(sessionId, false),
		[sessionId],
	);

	return null;
}

function RemoteAudio() {
	const daily = useDaily();
	const remoteSessionIds = useParticipantIds({ filter: "remote" });

	return (
		<>
			{remoteSessionIds.map((sessionId) => (
				<ParticipantAudio
					key={sessionId}
					sessionId={sessionId}
					userId={Number(daily?.participants()[sessionId]?.user_id)}
				/>
			))}
		</>
	);
}

function ParticipantAudio({
	sessionId,
	userId,
}: {
	sessionId: string;
	userId: number;
}) {
	const { volumeByUserId } = useVoiceSnapshot();
	const audioRef = React.useRef<HTMLAudioElement>(null);
	const volume = volumeByUserId.get(userId) ?? 1;

	React.useEffect(() => {
		const audio = audioRef.current;
		if (!audio) return;

		// iOS ignores `volume` (lol), muting at least works everywhere
		audio.volume = volume;
		audio.muted = volume === 0;
	}, [volume]);

	React.useEffect(() => {
		const audio = audioRef.current;
		if (!audio) return;

		audioElements.add(audio);
		return () => {
			audioElements.delete(audio);
		};
	}, []);

	return (
		<DailyAudioTrack
			ref={audioRef}
			sessionId={sessionId}
			onPlayFailed={(event) => {
				if (event.name === "NotAllowedError") {
					voiceClient.setAudioBlocked(true);
					voiceClient.flagError("AUTOPLAY_BLOCKED", event.message ?? null);
				}
			}}
		/>
	);
}

function Telemetry() {
	const { networkState } = useNetwork();
	const networkStateRef = React.useRef(networkState);
	networkStateRef.current = networkState;

	React.useEffect(() => {
		const totals = { lowQualitySeconds: 0, talkSeconds: 0 };

		const tick = setInterval(() => {
			const call = voiceClient.getSnapshot().call;
			if (call?.status !== "CONNECTED") return;

			if (
				networkStateRef.current === "bad" ||
				networkStateRef.current === "warning"
			) {
				totals.lowQualitySeconds++;
			}
			if (call.micEnabled) totals.talkSeconds++;
			voiceClient.setSummary({ ...totals });
		}, TELEMETRY_TICK_MS);
		const flush = setInterval(
			() => voiceClient.flushSummary(),
			VOICE_TELEMETRY_INTERVAL_MS,
		);

		return () => {
			clearInterval(tick);
			clearInterval(flush);
		};
	}, []);

	return null;
}

function ScreenWakeLock() {
	React.useEffect(() => {
		if (!("wakeLock" in navigator)) return;

		let sentinel: WakeLockSentinel | null = null;
		let released = false;

		const acquire = async () => {
			if (released || document.visibilityState !== "visible") return;
			try {
				sentinel = await navigator.wakeLock.request("screen");
			} catch (error) {
				logger.warn("Screen wake lock unavailable", error);
			}
		};

		void acquire();
		document.addEventListener("visibilitychange", acquire);

		return () => {
			released = true;
			document.removeEventListener("visibilitychange", acquire);
			void sentinel?.release().catch(() => {});
		};
	}, []);

	return null;
}

function participantsOf(daily: DailyCall): VoiceCallParticipant[] {
	return Object.values(daily.participants()).flatMap((participant) => {
		const userId = Number(participant.user_id);
		if (!Number.isInteger(userId)) return [];

		return {
			userId,
			sessionId: participant.session_id,
			isLocal: participant.local,
			audioEnabled:
				participant.tracks.audio.state === "playable" ||
				participant.tracks.audio.state === "sendable",
		};
	});
}
