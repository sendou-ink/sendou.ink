import { add } from "date-fns";
import { nanoid } from "nanoid";
import { ServerConfig } from "~/config.server";
import { actorIdOrNullSafe } from "~/features/auth/core/user.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { IS_E2E_TEST_RUN } from "~/utils/e2e";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";
import type { ChatMessage } from "./chat-types";
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

type PartialChatMessage = Pick<
	ChatMessage,
	| "type"
	| "context"
	| "room"
	| "revalidateOnly"
	| "revalidateScope"
	| "authorUserId"
>;
interface ChatSystemMessageService {
	send: (msg: PartialChatMessage | PartialChatMessage[]) => undefined;
}

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
	sendLeading: (msg) => postMessages([toFullMessage(msg)]),
	// no author on purpose: the trailing broadcast covers many actors' changes,
	// so no client may skip it as a duplicate of their own submission
	sendTrailing: (msg) =>
		postMessages([
			{
				id: nanoid(),
				timestamp: Date.now(),
				room: msg.room,
				revalidateOnly: true,
				revalidateScope: msg.revalidateScope,
			},
		]),
});

export const send: ChatSystemMessageService["send"] = (partialMsg) => {
	if (systemMessagesDisabled) return;

	const msgArr = Array.isArray(partialMsg) ? partialMsg : [partialMsg];

	const immediate: PartialChatMessage[] = [];
	for (const msg of msgArr) {
		if (revalidateThrottle.throttles(msg)) {
			revalidateThrottle.handle(msg);
		} else {
			immediate.push(msg);
		}
	}
	if (immediate.length === 0) return;

	return postMessages(immediate.map(toFullMessage));
};

function toFullMessage(partialMsg: PartialChatMessage): ChatMessage {
	return {
		id: nanoid(),
		timestamp: Date.now(),
		room: partialMsg.room,
		context: partialMsg.context,
		type: partialMsg.type,
		revalidateOnly: partialMsg.revalidateOnly,
		revalidateScope: partialMsg.revalidateScope,
		authorUserId: partialMsg.authorUserId ?? actorIdOrNullSafe() ?? undefined,
	};
}

function postMessages(fullMessages: ChatMessage[]) {
	return void fetch(ServerConfig.skalop.systemMessageUrl!, {
		method: "POST",
		body: JSON.stringify({
			action: "sendMessage",
			messages: fullMessages,
		}),
		headers: [
			[SKALOP_TOKEN_HEADER_NAME, ServerConfig.skalop.token!],
			["Content-Type", "application/json"],
		],
	}).catch(logSkalpError("sendMessage"));
}

/**
 * Tells skalop to send a contentless "your notifications changed" ping to the
 * users' websocket connections, prompting their clients to refetch. Fire and
 * forget like the other system messages; a lost ping only delays the refetch.
 */
export function notifyNotificationsChanged(userIds: number[]) {
	if (systemMessagesDisabled) return;
	if (userIds.length === 0) return;

	return void fetch(ServerConfig.skalop.systemMessageUrl!, {
		method: "POST",
		body: JSON.stringify({
			action: "notifyUsers",
			userIds,
		}),
		headers: [
			[SKALOP_TOKEN_HEADER_NAME, ServerConfig.skalop.token!],
			["Content-Type", "application/json"],
		],
	}).catch(logSkalpError("notifyUsers"));
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
