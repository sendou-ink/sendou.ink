import * as v from "valibot";
import { id } from "~/utils/schema";
import { NOTIFICATIONS } from "./notifications-contants";
import { isPushServiceEndpoint } from "./notifications-utils";

export const markAsSeenActionSchema = v.object({
	notificationIds: v.pipe(
		v.array(id),
		v.minLength(1),
		v.maxLength(NOTIFICATIONS.MAX_SHOWN),
	),
});

export const subscribeSchema = v.object({
	endpoint: v.pipe(
		v.string(),
		v.url(),
		v.maxLength(2048),
		v.check(isPushServiceEndpoint, "Unsupported push service"),
	),
	keys: v.object({
		auth: v.pipe(v.string(), v.maxLength(1024)),
		p256dh: v.pipe(v.string(), v.maxLength(1024)),
	}),
});
