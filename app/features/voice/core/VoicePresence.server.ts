import * as R from "remeda";
import type { ResolvedRoom } from "~/features/chat/ChatRoomResolver.server";
import * as EventBus from "~/features/events/core/EventBus.server";
import { chatRoomChannel, userChannel } from "~/features/events/events-types";
import { logger } from "~/utils/logger";
import { VOICE_PRESENCE_RECONCILE_INTERVAL_MS } from "../voice-constants";
import * as Daily from "./Daily.server";

// Daily keeps listing a participant for a moment after they left
const LEAVE_GRACE_MS = 15_000;

type PresenceRoom = Pick<ResolvedRoom, "roomId" | "participantUserIds">;

interface RoomPresence {
	userIds: Set<number>;
	reconciledAt: number;
}

const presenceByRoomId = new Map<number, RoomPresence>();
const leftAtByRoomUser = new Map<string, number>();

export function allOccupiedRooms() {
	return [...presenceByRoomId.entries()]
		.filter(([, presence]) => presence.userIds.size > 0)
		.map(([roomId, presence]) => ({ roomId, userIds: [...presence.userIds] }));
}

export function add(room: PresenceRoom, userId: number) {
	leftAtByRoomUser.delete(roomUserKey(room.roomId, userId));
	const presence = presenceOf(room.roomId);
	if (presence.userIds.has(userId)) return;

	presence.userIds.add(userId);
	publish(room, presence);
}

export function remove(room: PresenceRoom, userIds: number[]) {
	const presence = presenceByRoomId.get(room.roomId);
	if (!presence) return;

	pruneLeaves();
	for (const userId of userIds) {
		leftAtByRoomUser.set(roomUserKey(room.roomId, userId), Date.now());
	}

	const removed = userIds.filter((userId) => presence.userIds.delete(userId));
	if (removed.length === 0) return;

	publish(room, presence);
	if (presence.userIds.size === 0) presenceByRoomId.delete(room.roomId);
}

export async function reconciledUserIdsOf(room: PresenceRoom) {
	const presence = presenceOf(room.roomId);
	if (
		Date.now() - presence.reconciledAt <
		VOICE_PRESENCE_RECONCILE_INTERVAL_MS
	) {
		return [...presence.userIds];
	}
	presence.reconciledAt = Date.now();

	try {
		const dailyUserIds = (await Daily.findPresentUserIds(room.roomId)).filter(
			(userId) => !hasJustLeft(room.roomId, userId),
		);
		const changed = !R.isDeepEqual(
			[...presence.userIds].sort(),
			[...dailyUserIds].sort(),
		);
		presence.userIds = new Set(dailyUserIds);
		if (changed) publish(room, presence);
	} catch (error) {
		logger.error("Reconciling voice presence failed", error);
	}

	return [...presence.userIds];
}

function hasJustLeft(roomId: number, userId: number) {
	const leftAt = leftAtByRoomUser.get(roomUserKey(roomId, userId));

	return leftAt !== undefined && Date.now() - leftAt < LEAVE_GRACE_MS;
}

function pruneLeaves() {
	for (const [key, leftAt] of leftAtByRoomUser) {
		if (Date.now() - leftAt >= LEAVE_GRACE_MS) leftAtByRoomUser.delete(key);
	}
}

function roomUserKey(roomId: number, userId: number) {
	return `${roomId}:${userId}`;
}

function presenceOf(roomId: number) {
	const existing = presenceByRoomId.get(roomId);
	if (existing) return existing;

	const created: RoomPresence = { userIds: new Set(), reconciledAt: 0 };
	presenceByRoomId.set(roomId, created);
	return created;
}

function publish(room: PresenceRoom, presence: RoomPresence) {
	EventBus.publish(
		[...room.participantUserIds.map(userChannel), chatRoomChannel(room.roomId)],
		{
			kind: "voicePresence",
			roomId: room.roomId,
			userIds: [...presence.userIds],
		},
	);
}
