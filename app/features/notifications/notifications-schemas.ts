import { z } from "zod";
import { id } from "~/utils/zod";
import { NOTIFICATIONS } from "./notifications-contants";

export const markAsSeenActionSchema = z.object({
	notificationIds: z.array(id).min(1).max(NOTIFICATIONS.MAX_SHOWN),
});

export const subscribeSchema = z.object({
	endpoint: z.string().url(),
	keys: z.object({
		auth: z.string(),
		p256dh: z.string(),
	}),
});
