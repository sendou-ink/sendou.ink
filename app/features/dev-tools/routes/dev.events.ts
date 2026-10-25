import { requireUser } from "~/features/auth/core/user.server";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import { defineAction } from "~/form/define-action.server";
import { requireDevTools } from "../dev-tools-utils.server";

/** Sends an event down the user's own channel, a round trip check of the whole event pipeline. */
export const action = defineAction(async ({ request }) => {
	requireDevTools(request);
	const user = requireUser();

	ChatSystemMessage.notifyStatusChanged([user.id]);

	return null;
});
