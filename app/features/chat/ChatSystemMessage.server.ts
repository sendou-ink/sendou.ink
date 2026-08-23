import { add } from "date-fns";
import { ServerConfig } from "~/config.server";
import { actorIdOrNullSafe } from "~/features/auth/core/user.server";
import * as EventBus from "~/features/events/core/EventBus.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { IS_E2E_TEST_RUN } from "~/utils/e2e";
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
import { createRevalidateBroadcastThrottle } from "./revalidate-broadcast-throttle";

const SKALOP_TOKEN_HEADER_NAME = "Skalop-Token";

function logSkalpError(action: string) {
	return (err: unknown) => {
		const cause = err instanceof TypeError ? (err as any).cause : undefined;
		const code = cause?.code;

		if (code === "ECONNREFUSED") {
			logger.error(
				`Skalop "${action}" failed: connection refused at ${ServerConfig.skalop.systemMessageUrl} — is the skalop service running?`,
			);
		} else {
			logger.error(`Skalop "${action}" failed:`, err);
		}
	};
}

type RevalidateBroadcast = {
	/** Channel of the room whose pages should refetch, see `EventBus.chatRoomChannel`. */
	room: string;
	/** Actor whose own broadcast clients skip (their submission already reran the loaders). */
	authorUserId?: number;
	revalidateScope?: RevalidateScope;
	revalidateOnly: true;
	type?: SoundOnlySystemMessageType;
};

let systemMessagesDisabled = false;

if (!IS_E2E_TEST_RUN) {
	invariant(
		ServerConfig.skalop.systemMessageUrl,
		"Missing env var: SKALOP_SYSTEM_MESSAGE_URL",
	);
	invariant(ServerConfig.skalop.token, "Missing env var: SKALOP_TOKEN");
} else if (
	!ServerConfig.skalop.systemMessageUrl ||
	!ServerConfig.skalop.token
) {
	systemMessagesDisabled = true;
}

const REVALIDATE_BROADCAST_THROTTLE_WINDOW_MS = 2_000;

const revalidateThrottle = createRevalidateBroadcastThrottle({
	windowMs: REVALIDATE_BROADCAST_THROTTLE_WINDOW_MS,
	sendLeading: (msg) => publishRevalidate(msg),
	// no author on purpose: the trailing broadcast covers many actors' changes,
	// so no client may skip it as a duplicate of their own submission
	sendTrailing: (msg) =>
		EventBus.publish([msg.room], {
			kind: "revalidate",
			scope: msg.revalidateScope,
		}),
});

export function send(broadcast: RevalidateBroadcast | RevalidateBroadcast[]) {
	if (systemMessagesDisabled) return;

	for (const msg of Array.isArray(broadcast) ? broadcast : [broadcast]) {
		if (revalidateThrottle.throttles(msg)) {
			revalidateThrottle.handle(msg);
		} else {
			publishRevalidate(msg);
		}
	}
}

/**
 * Persists a system message (e.g. a reported score) as a chat line of the room
 * and publishes it, plus a revalidate broadcast so subscribed pages refetch.
 * Fire and forget like {@link send}: failures are logged, never thrown.
 */
export function sendPersisted(args: {
	roomId: number;
	type: PersistedSystemMessageType;
	/** The user the message describes, e.g. who left the group. */
	authorUserId: number;
}): Promise<void> {
	if (systemMessagesDisabled) return Promise.resolve();

	return persistAndPublish(args).catch((err) =>
		logger.error(`Persisting system message "${args.type}" failed:`, err),
	);
}

async function persistAndPublish(args: {
	roomId: number;
	type: PersistedSystemMessageType;
	authorUserId: number;
}) {
	const room = (await ChatRoomResolver.resolve([args.roomId]))[0];
	if (!room) return;

	const inserted = await ChatRepository.insertSystemMessage(args);
	const message = await ChatRepository.findMessageById(inserted.id);
	invariant(message, "inserted system message not found");

	EventBus.publish(
		[
			...room.participantUserIds.map(EventBus.userChannel),
			EventBus.chatRoomChannel(args.roomId),
		],
		{ kind: "chatMessage", roomId: args.roomId, message },
	);
	EventBus.publish([EventBus.chatRoomChannel(args.roomId)], {
		kind: "revalidate",
		authorUserId: actorIdOrNullSafe() ?? undefined,
	});
}

function publishRevalidate(msg: {
	room: string;
	revalidateScope?: RevalidateScope;
	authorUserId?: number;
	type?: SystemMessageType;
}) {
	EventBus.publish([msg.room], {
		kind: "revalidate",
		scope: msg.revalidateScope,
		authorUserId: msg.authorUserId ?? actorIdOrNullSafe() ?? undefined,
		type: soundOnlyType(msg.type),
	});
}

function soundOnlyType(
	type: SystemMessageType | undefined,
): SoundOnlySystemMessageType | undefined {
	if (
		type === "NEW_GROUP" ||
		type === "MATCH_STARTED" ||
		type === "READY_CHECK_STARTED" ||
		type === "LIKE_RECEIVED"
	) {
		return type;
	}
	return undefined;
}

/**
 * Publishes a contentless "your notifications changed" event to the users'
 * event streams, prompting their clients to refetch. Fire and forget like the
 * other system messages; a missed event only delays the refetch.
 */
export function notifyNotificationsChanged(userIds: number[]) {
	if (systemMessagesDisabled) return;
	if (userIds.length === 0) return;

	EventBus.publish(userIds.map(EventBus.userChannel), {
		kind: "notificationsChanged",
	});
}

/**
 * Publishes a "your chat room set changed" event to the users' event streams
 * after a membership change (leave, kick, group merge, added member). Clients
 * refetch their room list and drop rooms — including any locally held history —
 * they no longer have access to.
 */
export function notifyRoomsChanged(userIds: number[]) {
	if (systemMessagesDisabled) return;
	if (userIds.length === 0) return;

	EventBus.publish(userIds.map(EventBus.userChannel), {
		kind: "roomsChanged",
	});
}

export function removeRoom(chatCode: string) {
	if (systemMessagesDisabled) return;

	return void fetch(ServerConfig.skalop.systemMessageUrl!, {
		method: "POST",
		body: JSON.stringify({
			action: "removeRoom",
			chatCode,
		}),
		headers: [
			[SKALOP_TOKEN_HEADER_NAME, ServerConfig.skalop.token!],
			["Content-Type", "application/json"],
		],
	}).catch(logSkalpError("removeRoom"));
}

interface SetMetadataArgs {
	chatCode: string;
	header: string;
	subtitle: string;
	url: string;
	imageUrl?: string;
	participantUserIds: number[];
	expiresAfter?: { hours: number } | { days: number };
	expiresAt?: Date;
}

const MAX_DEDUP_CACHE_SIZE = 5_000;
const DEDUP_CACHE_PRUNE_TARGET = 2_500;
const MIN_EXPIRY_EXTENSION_MS = 15 * 60 * 1000;
const metadataDedup = new Map<
	string,
	{ participantsKey: string; expiresAt: number }
>();

export async function setMetadata(args: SetMetadataArgs) {
	if (systemMessagesDisabled) return;
	if (!ServerConfig.skalop.systemMessageUrl) return;

	invariant(
		args.expiresAt || args.expiresAfter,
		"setMetadata requires either expiresAt or expiresAfter",
	);

	const participantsKey = args.participantUserIds
		.slice()
		.sort((a, b) => a - b)
		.join(",");
	const expiresAt = args.expiresAt
		? args.expiresAt.getTime()
		: add(new Date(), args.expiresAfter!).getTime();

	// skip only if a resend would neither change the roster nor meaningfully
	// extend the room's lifetime
	const cached = metadataDedup.get(args.chatCode);
	if (
		cached?.participantsKey === participantsKey &&
		expiresAt - cached.expiresAt < MIN_EXPIRY_EXTENSION_MS
	) {
		return;
	}

	metadataDedup.delete(args.chatCode);
	metadataDedup.set(args.chatCode, { participantsKey, expiresAt });

	if (metadataDedup.size > MAX_DEDUP_CACHE_SIZE) {
		const entries = [...metadataDedup.entries()];
		metadataDedup.clear();
		for (const entry of entries.slice(-DEDUP_CACHE_PRUNE_TARGET)) {
			metadataDedup.set(entry[0], entry[1]);
		}
	}

	const chatUsers = await UserRepository.findChatUsersByUserIds(
		args.participantUserIds,
	);

	logger.debug(
		`Setting chat room metadata for ${args.chatCode} (participants: ${participantsKey})`,
	);

	return void fetch(ServerConfig.skalop.systemMessageUrl, {
		method: "POST",
		body: JSON.stringify({
			action: "setMetadata",
			chatCode: args.chatCode,
			metadata: {
				participantUserIds: args.participantUserIds,
				chatUsers,
				expiresAt,
				header: args.header,
				subtitle: args.subtitle,
				url: args.url,
				imageUrl: args.imageUrl,
			},
		}),
		headers: [
			[SKALOP_TOKEN_HEADER_NAME, ServerConfig.skalop.token!],
			["Content-Type", "application/json"],
		],
	}).catch(logSkalpError("setMetadata"));
}
