import { add } from "date-fns";
import { nanoid } from "nanoid";
import { ServerConfig } from "~/config.server";
import { actorIdOrNullSafe } from "~/features/auth/core/user.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { IS_E2E_TEST_RUN } from "~/utils/e2e";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";
import type { ChatMessage } from "./chat-types";

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

export const send: ChatSystemMessageService["send"] = (partialMsg) => {
	if (systemMessagesDisabled) return;

	const msgArr = Array.isArray(partialMsg) ? partialMsg : [partialMsg];

	const fullMessages: ChatMessage[] = msgArr.map((partialMsg) => {
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
	});

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
};

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
