import type { TFunction } from "i18next";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useChatContext } from "~/features/chat/ChatProvider";
import type { ChatRoomListItem } from "~/features/chat/chat-types";
import type { CommonUser } from "~/utils/kysely.server";
import { type VoiceCallStatus, voiceClient } from "./voice-client";
import {
	VOICE_ROOM_TYPES,
	type VoiceClientErrorKind,
	type VoiceInputMode,
} from "./voice-constants";
import { useVoiceRoom, useVoiceSnapshot } from "./voice-hooks";

export type VoiceActivityStatus = "AVAILABLE" | VoiceCallStatus;

export interface VoiceActivityParticipant {
	key: string;
	userId: number;
	user: CommonUser | undefined;
	isLocal: boolean;
	speaking: boolean;
	muted: boolean;
	deafened: boolean;
	/** Playback volume set for this user, 0-1. */
	volume: number;
}

/** What the header's voice button and panel show, from the voice client or the components showcase. */
export interface VoiceActivityState {
	status: VoiceActivityStatus;
	roomId: number;
	roomType: ChatRoomListItem["type"];
	roomTitle: string;
	participants: VoiceActivityParticipant[];
	micEnabled: boolean;
	deafened: boolean;
	inputMode: VoiceInputMode;
	audioBlocked: boolean;
	errorKind: VoiceClientErrorKind | null;
	canKick: boolean;
	latencyMs: number | null;
}

export interface VoiceActivityActions {
	join: () => void;
	leave: () => void;
	setMicEnabled: (enabled: boolean) => void;
	setDeafened: (deafened: boolean) => void;
	setInputMode: (mode: VoiceInputMode) => void;
	setVolume: (userId: number, volume: number) => void;
	kick: (userId: number) => void;
	resumeAudio: () => void;
}

export interface VoiceActivity {
	state: VoiceActivityState;
	actions: VoiceActivityActions;
}

/** `undefined` = no override, `null` = overridden to no voice activity */
let override: VoiceActivityState | null | undefined;
const overrideListeners = new Set<() => void>();

/**
 * Replaces the header's voice activity with a mock one, `undefined` goes
 * back to the real one. Used by the components showcase.
 */
export function setVoiceActivityOverride(
	next: VoiceActivityState | null | undefined,
) {
	override = next;
	for (const listener of overrideListeners) listener();
}

export function useVoiceActivityOverride() {
	return React.useSyncExternalStore(
		subscribeOverride,
		() => override,
		() => undefined,
	);
}

/**
 * The voice call the user is in, else the voice chat of their SendouQ
 * match or group they can join. Null when there is neither.
 */
export function useVoiceActivity(): VoiceActivity | null {
	const overridden = useVoiceActivityOverride();
	const real = useRealVoiceActivity();

	if (overridden === undefined) return real;
	if (overridden === null) return null;

	return { state: overridden, actions: OVERRIDE_ACTIONS };
}

function useRealVoiceActivity(): VoiceActivity | null {
	const { t } = useTranslation(["common"]);
	const chatContext = useChatContext();
	const { call, volumeByUserId } = useVoiceSnapshot();

	const room = call
		? (chatContext?.roomForId(call.roomId) ?? null)
		: joinableRoomCandidate(chatContext?.rooms ?? []);
	const voiceRoom = useVoiceRoom(room);

	if (!room) return null;
	if (!call && !(voiceRoom?.available && voiceRoom.canJoin)) return null;

	const userById = new Map(room.participants.map((user) => [user.id, user]));
	const volumeOf = (userId: number) => volumeByUserId.get(userId) ?? 1;

	const participants: VoiceActivityParticipant[] = call
		? call.participants.map((participant) => ({
				key: participant.sessionId,
				userId: participant.userId,
				user: userById.get(participant.userId),
				isLocal: participant.isLocal,
				speaking: call.speakingSessionIds.includes(participant.sessionId),
				muted: participant.isLocal
					? !call.micEnabled || call.deafened
					: !participant.audioEnabled,
				// xxx: others' deafen state is not synced over the call yet
				deafened: participant.isLocal && call.deafened,
				volume: volumeOf(participant.userId),
			}))
		: (voiceRoom?.userIds ?? []).map((userId) => ({
				key: String(userId),
				userId,
				user: userById.get(userId),
				isLocal: false,
				speaking: false,
				muted: false,
				deafened: false,
				volume: volumeOf(userId),
			}));

	return {
		state: {
			status: call?.status ?? "AVAILABLE",
			roomId: room.id,
			roomType: room.type,
			roomTitle: voiceRoomTitle(room, t),
			participants,
			micEnabled: call?.micEnabled ?? false,
			deafened: call?.deafened ?? false,
			inputMode: call?.inputMode ?? "OPEN_MIC",
			audioBlocked: call?.audioBlocked ?? false,
			errorKind: call?.errorKind ?? null,
			canKick: voiceRoom?.canKick ?? false,
			// xxx: read the round trip time off the Daily call's network stats
			latencyMs: null,
		},
		actions: {
			join: () => void voiceClient.join(room.id),
			leave: () => void voiceClient.leave(),
			setMicEnabled: voiceClient.setMicEnabled,
			setDeafened: voiceClient.setDeafened,
			// xxx: persist as the user's voicePushToTalk preference, now it lasts until the page reloads
			setInputMode: voiceClient.setInputMode,
			setVolume: voiceClient.setVolume,
			kick: (userId) => void voiceClient.kick(room.id, userId),
			resumeAudio: voiceClient.resumeAudio,
		},
	};
}

function voiceRoomTitle(room: ChatRoomListItem, t: TFunction<["common"]>) {
	switch (room.type) {
		case "SQ_MATCH":
			return t("common:chat.room.match", { id: room.titleParams.matchId });
		case "LOBBY":
			return room.titleParams.name;
		case "LOBBY_TEAM":
			return room.titleParams.side === "ALPHA"
				? t("common:chat.room.lobbyTeamAlpha")
				: t("common:chat.room.lobbyTeamBravo");
		default:
			return t("common:chat.room.group", {
				members: room.participantUserIds.length,
			});
	}
}

/** The SendouQ match's room beats the group's: during a match it is the one the players talk in. */
function joinableRoomCandidate(rooms: ChatRoomListItem[]) {
	const voiceRooms = rooms.filter(
		(room) =>
			!room.inactive &&
			VOICE_ROOM_TYPES.some((voiceRoomType) => voiceRoomType === room.type),
	);

	return (
		voiceRooms.find((room) => room.type === "SQ_MATCH") ?? voiceRooms[0] ?? null
	);
}

function subscribeOverride(listener: () => void) {
	overrideListeners.add(listener);
	return () => {
		overrideListeners.delete(listener);
	};
}

function updateOverride(patch: Partial<VoiceActivityState>) {
	if (!override) return;
	setVoiceActivityOverride({ ...override, ...patch });
}

function updateOverrideParticipants(
	update: (participant: VoiceActivityParticipant) => VoiceActivityParticipant,
) {
	if (!override) return;
	updateOverride({ participants: override.participants.map(update) });
}

const OVERRIDE_ACTIONS: VoiceActivityActions = {
	join: () => updateOverride({ status: "CONNECTED" }),
	leave: () => updateOverride({ status: "AVAILABLE" }),
	setMicEnabled: (micEnabled) => {
		updateOverride({ micEnabled });
		updateOverrideParticipants((participant) =>
			participant.isLocal
				? { ...participant, muted: !micEnabled || participant.deafened }
				: participant,
		);
	},
	setDeafened: (deafened) => {
		updateOverride({ deafened });
		updateOverrideParticipants((participant) =>
			participant.isLocal
				? {
						...participant,
						deafened,
						muted: deafened || !override?.micEnabled,
					}
				: participant,
		);
	},
	setInputMode: (inputMode) =>
		updateOverride({
			inputMode,
			micEnabled: inputMode === "OPEN_MIC",
		}),
	setVolume: (userId, volume) =>
		updateOverrideParticipants((participant) =>
			participant.userId === userId ? { ...participant, volume } : participant,
		),
	kick: (userId) => {
		if (!override) return;
		updateOverride({
			participants: override.participants.filter(
				(participant) => participant.userId !== userId,
			),
		});
	},
	resumeAudio: () => updateOverride({ audioBlocked: false }),
};
