import * as R from "remeda";
import { actorIdOrNullSafe } from "~/features/auth/core/user.server";
import * as EventBus from "~/features/events/core/EventBus.server";
import { chatRoomChannel, userChannel } from "~/features/events/events-types";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";
import * as ChatRepository from "./ChatRepository.server";
import * as ChatRoomResolver from "./ChatRoomResolver.server";
import type {
	PersistedSystemMessageType,
	RevalidateScope,
	SoundOnlySystemMessageType,
	SystemMessageType,
} from "./chat-types";
import { soundOnlyType } from "./chat-utils";
import { createRevalidateBroadcastThrottle } from "./revalidate-broadcast-throttle";

type RevalidateBroadcast = {
	/** Channel whose subscribed pages should refetch, see `chatRoomChannel`. */
	channel: string;
	/** Actor whose own broadcast clients skip (their submission already reran the loaders). */
	authorUserId?: number;
	revalidateScope?: RevalidateScope;
	type?: SoundOnlySystemMessageType;
};

const REVALIDATE_BROADCAST_THROTTLE_WINDOW_MS = 2_000;

const revalidateThrottle = createRevalidateBroadcastThrottle({
	windowMs: REVALIDATE_BROADCAST_THROTTLE_WINDOW_MS,
	sendLeading: (msg) => publishRevalidate(msg),
	// no author on purpose: the trailing broadcast covers many actors' changes,
	// so no client may skip it as a duplicate of their own submission
	sendTrailing: (msg) =>
		EventBus.publish([msg.channel], {
			kind: "revalidate",
			scope: msg.revalidateScope,
		}),
});

/** Publishes a contentless revalidate broadcast to the channel(s) so subscribed pages refetch. Noisy kinds are throttled per channel, see {@link createRevalidateBroadcastThrottle}. */
export function send(broadcast: RevalidateBroadcast | RevalidateBroadcast[]) {
	for (const msg of Array.isArray(broadcast) ? broadcast : [broadcast]) {
		if (revalidateThrottle.throttles(msg)) {
			revalidateThrottle.handle(msg);
		} else {
			publishRevalidate(msg);
		}
	}
}

/** Persists a system message (e.g. a reported score) as a chat line and publishes it plus a revalidate broadcast. Fire and forget like {@link send}: failures are logged, never thrown. */
export function sendPersisted(args: {
	roomId: number;
	type: PersistedSystemMessageType;
	/** The user the message describes, e.g. who left the group. */
	authorUserId: number;
}): Promise<void> {
	return persistAndPublish(args).catch((err) =>
		logger.error(`Persisting system message "${args.type}" failed:`, err),
	);
}

async function persistAndPublish(args: {
	roomId: number;
	type: PersistedSystemMessageType;
	authorUserId: number;
}) {
	const room = await ChatRoomResolver.resolve(args.roomId);
	if (!room) return;

	const inserted = await ChatRepository.insertSystemMessage(args);
	const message = await ChatRepository.findMessageById(inserted.id);
	invariant(message, "inserted system message not found");

	EventBus.publish(
		[...room.participantUserIds.map(userChannel), chatRoomChannel(args.roomId)],
		{ kind: "chatMessage", roomId: args.roomId, message },
	);
	EventBus.publish([chatRoomChannel(args.roomId)], {
		kind: "revalidate",
		authorUserId: actorIdOrNullSafe() ?? undefined,
	});
}

function publishRevalidate(msg: {
	channel: string;
	revalidateScope?: RevalidateScope;
	authorUserId?: number;
	type?: SystemMessageType;
}) {
	EventBus.publish([msg.channel], {
		kind: "revalidate",
		scope: msg.revalidateScope,
		authorUserId: msg.authorUserId ?? actorIdOrNullSafe() ?? undefined,
		type: soundOnlyType(msg.type),
	});
}

/** Publishes a contentless "your notifications changed" event to the users' streams. Fire and forget; a missed event only delays the refetch. */
export function notifyNotificationsChanged(userIds: number[]) {
	if (userIds.length === 0) return;

	EventBus.publish(userIds.map(userChannel), {
		kind: "notificationsChanged",
	});
}

/** Publishes a "your chat room set changed" event after a membership change; clients refetch their room list and drop rooms (and held history) they lost access to. */
export function notifyRoomsChanged(userIds: number[]) {
	if (userIds.length === 0) return;

	EventBus.publish(R.unique(userIds).map(userChannel), {
		kind: "roomsChanged",
	});
}

/** Same, for a change to the rooms themselves (participants resolved from them), e.g. the inactive flag flipping with a match completing. Fire and forget like {@link send}. */
export function notifyRoomsChangedByRoomIds(roomIds: number[]): Promise<void> {
	return notifyParticipantsOfRoomsChanged(roomIds).catch((err) =>
		logger.error("Notifying participants of changed chat rooms failed:", err),
	);
}

async function notifyParticipantsOfRoomsChanged(roomIds: number[]) {
	if (roomIds.length === 0) return;

	const rooms = await ChatRoomResolver.resolveAll(roomIds);

	notifyRoomsChanged(rooms.flatMap((room) => room.participantUserIds));
}
