import webPush from "web-push";
import { Config } from "~/config";
import { ServerConfig } from "~/config.server";
import { logger } from "~/utils/logger";

export let webPushEnabled = false;

if (
	ServerConfig.vapid.email &&
	Config.vapid.publicKey &&
	ServerConfig.vapid.privateKey
) {
	webPush.setVapidDetails(
		ServerConfig.vapid.email,
		Config.vapid.publicKey,
		ServerConfig.vapid.privateKey,
	);
	webPushEnabled = true;
} else {
	logger.info("VAPID env vars not set, push notifications will not work");
}

export default webPush;
