import * as R from "remeda";
import type { ResolvedRoom } from "~/features/chat/ChatRoomResolver.server";
import * as EventBus from "~/features/events/core/EventBus.server";
import { chatRoomChannel, userChannel } from "~/features/events/events-types";
import { logger } from "~/utils/logger";
import { VOICE_PRESENCE_RECONCILE_INTERVAL_MS } from "../voice-constants";
import * as Daily from "./Daily.server";

// Daily's presence lags a moment behind joins and leaves
const PRESENCE_GRACE_MS = 15_000;

type PresenceRoom = Pick<ResolvedRoom, "roomId" | "participantUserIds">;

interface RoomPresence {
	userIds: Set<number>;
	reconciledAt: number;
}

const presenceByRoomId = new Map<number, RoomPresence>();
const joinedAtByRoomUser = new Map<string, number>();
const leftAtByRoomUser = new Map<string, number>();

export function allOccupiedRooms() {
	return [...presenceByRoomId.entries()]
		.filter(([, presence]) => presence.userIds.size > 0)
		.map(([roomId, presence]) => ({ roomId, userIds: [...presence.userIds] }));
}

export function add(room: PresenceRoom, userId: number) {
	pruneGraceEntries();
	leftAtByRoomUser.delete(roomUserKey(room.roomId, userId));
	joinedAtByRoomUser.set(roomUserKey(room.roomId, userId), Date.now());
	const presence = presenceOf(room.roomId);
	if (presence.userIds.has(userId)) return;

	presence.userIds.add(userId);
	publish(room, presence);
}

export function remove(room: PresenceRoom, userIds: number[]) {
	const presence = presenceByRoomId.get(room.roomId);
	if (!presence) return;

	pruneGraceEntries();
	for (const userId of userIds) {
		joinedAtByRoomUser.delete(roomUserKey(room.roomId, userId));
		leftAtByRoomUser.set(roomUserKey(room.roomId, userId), Date.now());
	}

	const removed = userIds.filter((userId) => presence.userIds.delete(userId));
	if (removed.length === 0) return;

	publish(room, presence);
	if (presence.userIds.size === 0) presenceByRoomId.delete(room.roomId);
}

/** Forgets every room's presence, for an e2e test starting over with a fresh database. */
export function clearAll() {
	presenceByRoomId.clear();
	joinedAtByRoomUser.clear();
	leftAtByRoomUser.clear();
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
		const dailyUserIds = await Daily.findPresentUserIds(room.roomId);

		// joins and leaves may have landed during the fetch, possibly replacing the entry
		const current = presenceOf(room.roomId);
		current.reconciledAt = presence.reconciledAt;
		const userIds = R.unique([
			...dailyUserIds.filter(
				(userId) => !isWithinGrace(leftAtByRoomUser, room.roomId, userId),
			),
			...[...current.userIds].filter((userId) =>
				isWithinGrace(joinedAtByRoomUser, room.roomId, userId),
			),
		]);

		const changed = !R.isDeepEqual(
			[...current.userIds].sort(),
			[...userIds].sort(),
		);

		current.userIds = new Set(userIds);
		if (changed) publish(room, current);
	} catch (error) {
		logger.error("Reconciling voice presence failed", error);
	}

	return [...presenceOf(room.roomId).userIds];
}

function isWithinGrace(
	timestampByRoomUser: Map<string, number>,
	roomId: number,
	userId: number,
) {
	const timestamp = timestampByRoomUser.get(roomUserKey(roomId, userId));

	return timestamp !== undefined && Date.now() - timestamp < PRESENCE_GRACE_MS;
}

function pruneGraceEntries() {
	for (const timestampByRoomUser of [joinedAtByRoomUser, leftAtByRoomUser]) {
		for (const [key, timestamp] of timestampByRoomUser) {
			if (Date.now() - timestamp >= PRESENCE_GRACE_MS) {
				timestampByRoomUser.delete(key);
			}
		}
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
