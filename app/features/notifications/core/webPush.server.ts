import webPush from "web-push";
import { logger } from "~/utils/logger";

if (
	process.env.VAPID_EMAIL &&
	process.env.VITE_VAPID_PUBLIC_KEY &&
	process.env.VAPID_PRIVATE_KEY
) {
	webPush.setVapidDetails(
		process.env.VAPID_EMAIL,
		process.env.VITE_VAPID_PUBLIC_KEY,
		process.env.VAPID_PRIVATE_KEY,
	);
} else {
	logger.info("VAPID env vars not set, push notifications will not work");
}

export default webPush;
