import type { ActionFunctionArgs } from "react-router";
import { parseRequestPayload } from "~/utils/remix.server";
import * as NotificationRepository from "../NotificationRepository.server";
import { markAsSeenActionSchema } from "../notifications-schemas";

export const action = async ({ request }: ActionFunctionArgs) => {
	const data = await parseRequestPayload({
		request,
		schema: markAsSeenActionSchema,
	});

	await NotificationRepository.markOwnAsSeen(data.notificationIds);

	return null;
};
