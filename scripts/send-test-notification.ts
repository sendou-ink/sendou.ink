import { db } from "~/db/sql";
import { notify } from "~/features/notifications/core/notify.server";
import { webPushEnabled } from "~/features/notifications/core/webPush.server";
import * as NotificationRepository from "~/features/notifications/NotificationRepository.server";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";

const username = process.argv[2]?.trim() ?? "Sendou";
const seasonNth = Number(process.argv[3] ?? 1);

invariant(!Number.isNaN(seasonNth), "season nth must be a number (argument 2)");

const user = await db
	.selectFrom("User")
	.select(["id", "username"])
	.where("username", "=", username)
	.executeTakeFirst();

invariant(user, `user with username ${username} not found`);

if (!webPushEnabled) {
	logger.warn(
		"VAPID env vars not set, only the in-app notification will be created",
	);
}

const subscriptions =
	await NotificationRepository.findAllSubscriptionsByUserIds([user.id]);
logger.info(
	`${user.username} (id ${user.id}) has ${subscriptions.length} push subscription(s)`,
);

await notify({
	userIds: [user.id],
	notification: { type: "SEASON_STARTED", meta: { seasonNth } },
	skipPushGracePeriod: true,
});

logger.info("Notification sent");

process.exit(0);
