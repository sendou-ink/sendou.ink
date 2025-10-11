import { nanoid } from "nanoid";
import { IS_E2E_TEST_RUN } from "~/utils/e2e";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";
import type { ChatMessage } from "./chat-types";

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
		body: JSON.stringify(fullMessages),
		headers: [[SKALOP_TOKEN_HEADER_NAME, process.env.SKALOP_TOKEN!]],
	}).catch(logger.error);
};
