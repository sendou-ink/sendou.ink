import { Config } from "~/config";
import { ServerConfig } from "~/config.server";
import type { NotificationSubscription } from "~/db/tables-json";
import { logger } from "~/utils/logger";
import * as WebPushCrypto from "./webPushCrypto";

export type PushUrgency = "very-low" | "low" | "normal" | "high";

const MESSAGE_TTL_SECONDS = 4 * 7 * 24 * 60 * 60;

const vapid =
	ServerConfig.vapid.email &&
	Config.vapid.publicKey &&
	ServerConfig.vapid.privateKey
		? {
				subject: ServerConfig.vapid.email,
				publicKey: Config.vapid.publicKey,
				privateKey: ServerConfig.vapid.privateKey,
			}
		: null;

if (!vapid) {
	logger.info("VAPID env vars not set, push notifications will not work");
}

export const webPushEnabled = vapid !== null;

/**
 * Sends an encrypted push message to the subscription's push service.
 * Resolves to `"SUBSCRIPTION_GONE"` when the push service reports the subscription expired or unsubscribed, throws on other failures.
 */
export async function sendNotification(
	subscription: NotificationSubscription,
	payload: string,
	{ urgency, timeout }: { urgency: PushUrgency; timeout: number },
) {
	if (!vapid) throw new Error("Web push is not enabled");

	const response = await fetch(subscription.endpoint, {
		method: "POST",
		headers: {
			Authorization: await WebPushCrypto.vapidAuthorization({
				audience: new URL(subscription.endpoint).origin,
				...vapid,
			}),
			TTL: String(MESSAGE_TTL_SECONDS),
			Urgency: urgency,
			"Content-Encoding": "aes128gcm",
			"Content-Type": "application/octet-stream",
		},
		body: await WebPushCrypto.encryptPayload({
			payload,
			keys: subscription.keys,
		}),
		signal: AbortSignal.timeout(timeout),
	});

	if (response.status === 404 || response.status === 410) {
		return "SUBSCRIPTION_GONE";
	}
	if (!response.ok) {
		throw new Error(
			`Push service responded ${response.status}: ${await response.text()}`,
		);
	}

	return "SENT";
}
