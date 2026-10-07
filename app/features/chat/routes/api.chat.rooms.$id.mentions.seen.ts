import type { ActionFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import { resolveNotifications } from "~/features/notifications/core/resolve.server";
import { parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/schema";

export const action = async ({ params }: ActionFunctionArgs) => {
	const user = requireUser();
	const { id: roomId } = parseParams({ params, schema: idObject });

	await resolveNotifications({
		userIds: [user.id],
		type: "CHAT_MENTION",
		meta: { roomId },
	});

	return null;
};
