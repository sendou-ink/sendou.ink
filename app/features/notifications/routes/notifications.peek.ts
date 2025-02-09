import type { LoaderFunctionArgs } from "@remix-run/node";
import { requireUser } from "~/features/auth/core/user.server";
import type { SerializeFrom } from "~/utils/remix";
import * as NotificationRepository from "../NotificationRepository.server";
import { NOTIFICATIONS } from "../notifications-contants";

// xxx: caching

export type NotificationsLoaderData = SerializeFrom<typeof loader>;
export type LoaderNotification =
	NotificationsLoaderData["notifications"][number];

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = await requireUser(request);

	const notifications = await NotificationRepository.findByUserId(user.id, {
		limit: NOTIFICATIONS.PEEK_COUNT,
	});

	return { notifications };
};
