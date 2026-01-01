import type { ActionFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import { parseRequestPayload } from "~/utils/remix.server";
import * as NotificationRepository from "../NotificationRepository.server";
import { markAsSeenActionSchema } from "../notifications-schemas";

export const action = async ({ request }: ActionFunctionArgs) => {
	const user = await requireUser();
	const data = await parseRequestPayload({
		request,
		schema: markAsSeenActionSchema,
	});

	await NotificationRepository.markAsSeen({
		userId: user.id,
		notificationIds: data.notificationIds,
	});

	return null;
};
