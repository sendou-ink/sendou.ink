import type { TFunction } from "i18next";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useUser } from "~/features/auth/core/user";
import {
	useChatContext,
	useCurrentRouteChatRooms,
} from "~/features/chat/ChatProvider";
import type { ChatRoomListItem } from "~/features/chat/chat-types";
import { voicePushToTalkSchema } from "~/features/settings/settings-schemas";
import { useActionSubmit } from "~/hooks/useActionSubmit";
import type { CommonUser } from "~/utils/kysely.server";
import { SETTINGS_PAGE } from "~/utils/urls";
import {
	type VoiceCall,
	type VoiceCallStatus,
	type VoiceRoomState,
	voiceClient,
} from "./voice-client";
import type { VoiceClientErrorKind, VoiceInputMode } from "./voice-constants";
import { useVoiceRooms, useVoiceSnapshot } from "./voice-hooks";

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

/** One voice chat of the header's voice panel, from the voice client or the components showcase. */
export interface VoiceActivityState {
	status: VoiceActivityStatus;
	roomId: number;
	roomType: ChatRoomListItem["type"];
	roomTitle: string;
	participants: VoiceActivityParticipant[];
	micEnabled: boolean;
	deafened: boolean;
	inputMode: VoiceInputMode;
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
 * The voice chats of the user's rooms and the ones the page surfaces (an organizer on a match page): the call
 * they are in first, then the ones they can join. Empty when there is none.
 */
export function useVoiceActivities(): VoiceActivity[] {
	const overridden = useVoiceActivityOverride();
	const real = useRealVoiceActivities();

	if (overridden === undefined) return real;
	if (overridden === null) return [];

	return [{ state: overridden, actions: OVERRIDE_ACTIONS }];
}

function useRealVoiceActivities(): VoiceActivity[] {
	const { t } = useTranslation(["common"]);
	const chatContext = useChatContext();
	const localUserId = useUser()?.id;
	const { call, volumeByUserId, inputMode } = useVoiceSnapshot();
	const pushToTalkPreference = useActionSubmit(voicePushToTalkSchema, {
		action: SETTINGS_PAGE,
	});
	const setInputMode = (mode: VoiceInputMode) => {
		voiceClient.setInputMode(mode);
		pushToTalkPreference.submit("UPDATE_VOICE_PUSH_TO_TALK", {
			newValue: mode === "PUSH_TO_TALK",
		});
	};

	const routeRooms = useCurrentRouteChatRooms();

	const callRoom = call ? chatContext?.roomForId(call.roomId) : undefined;
	const listedRooms = chatContext?.rooms ?? [];
	const observedRouteRooms = routeRooms
		.filter((entry) => !listedRooms.some((room) => room.id === entry.room.id))
		.map((entry) => chatContext?.roomForId(entry.room.id) ?? entry.room);
	const joinableRooms = [...listedRooms, ...observedRouteRooms].filter(
		(room) => !room.inactive && room.id !== callRoom?.id,
	);
	const rooms = callRoom ? [callRoom, ...joinableRooms] : joinableRooms;
	const voiceRoomsById = useVoiceRooms(rooms);
	const volumeOf = (userId: number) => volumeByUserId.get(userId) ?? 1;

	return rooms.flatMap((room) => {
		const voiceRoom = voiceRoomsById.get(room.id) ?? null;
		const roomCall = room === callRoom ? call : null;
		if (!roomCall && !(voiceRoom?.available && voiceRoom.canJoin)) return [];

		return [
			toVoiceActivity({
				room,
				call: roomCall,
				voiceRoom,
				localUserId,
				inputMode,
				setInputMode,
				volumeOf,
				t,
			}),
		];
	});
}

function toVoiceActivity({
	room,
	call,
	voiceRoom,
	localUserId,
	inputMode,
	setInputMode,
	volumeOf,
	t,
}: {
	room: ChatRoomListItem;
	call: VoiceCall | null;
	voiceRoom: VoiceRoomState | null;
	localUserId: number | undefined;
	inputMode: VoiceInputMode;
	setInputMode: (mode: VoiceInputMode) => void;
	volumeOf: (userId: number) => number;
	t: TFunction<["common"]>;
}): VoiceActivity {
	const userById = new Map(
		[...room.participants, ...(voiceRoom?.guests ?? [])].map((user) => [
			user.id,
			user,
		]),
	);

	const callParticipants: VoiceActivityParticipant[] = call
		? call.participants.map((participant) => ({
				key: participant.sessionId,
				userId: participant.userId,
				user: userById.get(participant.userId),
				isLocal: participant.isLocal,
				speaking: call.speakingSessionIds.includes(participant.sessionId),
				muted: participant.isLocal
					? !call.micEnabled || call.deafened
					: !participant.audioEnabled,
				deafened: participant.isLocal ? call.deafened : participant.deafened,
				volume: volumeOf(participant.userId),
			}))
		: [];

	const presentParticipants: VoiceActivityParticipant[] = (
		voiceRoom?.userIds ?? []
	)
		.filter(
			(userId) =>
				!callParticipants.some((participant) => participant.userId === userId),
		)
		.map((userId) => ({
			key: String(userId),
			userId,
			user: userById.get(userId),
			isLocal: userId === localUserId,
			speaking: false,
			muted: false,
			deafened: false,
			volume: volumeOf(userId),
		}));
	const participants = [...callParticipants, ...presentParticipants];

	return {
		state: {
			status: call?.status ?? "AVAILABLE",
			roomId: room.id,
			roomType: room.type,
			roomTitle: voiceRoomTitle(room, t),
			participants,
			micEnabled: call?.micEnabled ?? false,
			deafened: call?.deafened ?? false,
			inputMode: call?.inputMode ?? inputMode,
			errorKind: call?.errorKind ?? null,
			canKick: voiceRoom?.canKick ?? false,
			latencyMs: call?.latencyMs ?? null,
		},
		actions: {
			join: () => void voiceClient.join(room.id),
			leave: () => void voiceClient.leave(),
			setMicEnabled: voiceClient.setMicEnabled,
			setDeafened: voiceClient.setDeafened,
			setInputMode,
			setVolume: voiceClient.setVolume,
			kick: (userId) => void voiceClient.kick(room.id, userId),
		},
	};
}

function voiceRoomTitle(room: ChatRoomListItem, t: TFunction<["common"]>) {
	switch (room.type) {
		case "SQ_GROUP":
			return t("common:chat.room.group", {
				members: room.participantUserIds.length,
			});
		case "SQ_MATCH":
		case "TOURNAMENT_MATCH":
			return t("common:chat.room.match", { id: room.titleParams.matchId });
		case "TOURNAMENT_TEAM":
			return room.titleParams.teamName;
		case "SCRIM":
			return t("common:chat.room.scrim");
		case "LOBBY":
			return room.titleParams.name;
		case "LOBBY_TEAM":
			return room.titleParams.side === "ALPHA"
				? t("common:chat.room.lobbyTeamAlpha")
				: t("common:chat.room.lobbyTeamBravo");
	}
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
};
