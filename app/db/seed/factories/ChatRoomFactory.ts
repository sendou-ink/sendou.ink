import { addHours } from "date-fns";
import * as ChatRepository from "~/features/chat/ChatRepository.server";
import { defineFactory } from "../core/defineFactory";

/** Creates chat rooms. Owner rows point at these via their `chatRoomId`. */
export const { create } = defineFactory({
	defaults: () => ({
		type: "SQ_MATCH" as const,
		expiresAt: addHours(new Date(), 12),
	}),
	insert: (args: Parameters<typeof ChatRepository.insertRoom>[0]) =>
		ChatRepository.insertRoom(args),
});
