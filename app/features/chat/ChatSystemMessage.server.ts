import { add } from "date-fns";
import { nanoid } from "nanoid";
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
				`Skalop "${action}" failed: connection refused at ${process.env.SKALOP_SYSTEM_MESSAGE_URL} — is the skalop service running?`,
			);
		} else {
			logger.error(`Skalop "${action}" failed:`, err);
		}
	};
}

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
	}).catch(logSkalpError("sendMessage"));
};

export function removeRoom(chatCode: string) {
	if (systemMessagesDisabled) return;

	return void fetch(process.env.SKALOP_SYSTEM_MESSAGE_URL!, {
		method: "POST",
		body: JSON.stringify({
			action: "removeRoom",
			chatCode,
		}),
		headers: [
			[SKALOP_TOKEN_HEADER_NAME, process.env.SKALOP_TOKEN!],
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
const metadataDedup = new Map<string, string>();

export async function setMetadata(args: SetMetadataArgs) {
	if (systemMessagesDisabled) return;
	if (!process.env.SKALOP_SYSTEM_MESSAGE_URL) return;

	const participantsKey = args.participantUserIds
		.slice()
		.sort((a, b) => a - b)
		.join(",");
	const cached = metadataDedup.get(args.chatCode);
	if (cached === participantsKey) return;

	metadataDedup.delete(args.chatCode);
	metadataDedup.set(args.chatCode, participantsKey);

	if (metadataDedup.size > MAX_DEDUP_CACHE_SIZE) {
		const entries = [...metadataDedup.entries()];
		metadataDedup.clear();
		for (const entry of entries.slice(-DEDUP_CACHE_PRUNE_TARGET)) {
			metadataDedup.set(entry[0], entry[1]);
		}
	}

	invariant(
		args.expiresAt || args.expiresAfter,
		"setMetadata requires either expiresAt or expiresAfter",
	);

	const expiresAt = args.expiresAt
		? args.expiresAt.getTime()
		: add(new Date(), args.expiresAfter!).getTime();

	const chatUsers = await UserRepository.findChatUsersByUserIds(
		args.participantUserIds,
	);

	return void fetch(process.env.SKALOP_SYSTEM_MESSAGE_URL, {
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
			[SKALOP_TOKEN_HEADER_NAME, process.env.SKALOP_TOKEN!],
			["Content-Type", "application/json"],
		],
	}).catch(logSkalpError("setMetadata"));
}
