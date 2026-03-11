import { nanoid } from "nanoid";
import { IS_E2E_TEST_RUN } from "~/utils/e2e";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";
import type { ChatMessage, ChatUser } from "./chat-types";

const SKALOP_TOKEN_HEADER_NAME = "Skalop-Token";

type PartialChatMessage = Pick<
	ChatMessage,
	"type" | "context" | "room" | "revalidateOnly"
>;
interface ChatSystemMessageService {
	send: (msg: PartialChatMessage | PartialChatMessage[]) => undefined;
}

let systemMessagesDisabled = false;

if (!IS_E2E_TEST_RUN) {
	invariant(
		process.env.SKALOP_SYSTEM_MESSAGE_URL,
		"Missing env var: SKALOP_SYSTEM_MESSAGE_URL",
	);
	invariant(process.env.SKALOP_TOKEN, "Missing env var: SKALOP_TOKEN");
} else if (
	!process.env.SKALOP_SYSTEM_MESSAGE_URL ||
	!process.env.SKALOP_TOKEN
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
		};
	});

	return void fetch(process.env.SKALOP_SYSTEM_MESSAGE_URL!, {
		method: "POST",
		body: JSON.stringify({
			action: "sendMessage",
			messages: fullMessages,
		}),
		headers: [
			[SKALOP_TOKEN_HEADER_NAME, process.env.SKALOP_TOKEN!],
			["Content-Type", "application/json"],
		],
	}).catch(logger.error);
};

interface SetMetadataArgs {
	chatCode: string;
	header: string;
	subtitle: string;
	url: string;
	participantUserIds: number[];
	chatUsers: Record<number, ChatUser>;
	expiresAt: number;
}

// xxx: actually there is no dedup like this, for as long as the service is up, we dont resend metadata
const DEDUP_INTERVAL_MS = 30_000;
const DEDUP_PRUNE_MS = 1000 * 60 * 60 * 24 * 30;
const metadataDedup = new Map<string, number>();

export function setMetadata(args: SetMetadataArgs) {
	if (systemMessagesDisabled) return;
	if (!process.env.SKALOP_SYSTEM_MESSAGE_URL) return;

	const now = Date.now();
	const lastSent = metadataDedup.get(args.chatCode);
	if (lastSent && now - lastSent < DEDUP_INTERVAL_MS) return;
	metadataDedup.set(args.chatCode, now);

	// Prune old entries
	for (const [key, timestamp] of metadataDedup) {
		if (now - timestamp > DEDUP_PRUNE_MS) {
			metadataDedup.delete(key);
		}
	}

	return void fetch(process.env.SKALOP_SYSTEM_MESSAGE_URL, {
		method: "POST",
		body: JSON.stringify({
			action: "setMetadata",
			chatCode: args.chatCode,
			metadata: {
				participantUserIds: args.participantUserIds,
				chatUsers: args.chatUsers,
				expiresAt: args.expiresAt,
				header: args.header,
				subtitle: args.subtitle,
				url: args.url,
			},
		}),
		headers: [
			[SKALOP_TOKEN_HEADER_NAME, process.env.SKALOP_TOKEN!],
			["Content-Type", "application/json"],
		],
	}).catch(logger.error);
}
