import type { TablesInsertable } from "~/db/tables";
import * as NotificationRepository from "~/features/notifications/NotificationRepository.server";
import type { Notification } from "~/features/notifications/notifications-types";
import { backdate } from "../core/backdate";
import { defineFactory } from "../core/defineFactory";

type InsertArgs = {
	notification: Notification;
	/** Who receives it, and whether they have seen it. */
	users: Array<Omit<TablesInsertable["NotificationUser"], "notificationId">>;
};

type Options = {
	/** When the notification was sent, for one that should look older than now. */
	createdAt?: Date;
};

/** Creates notifications, delivered to `users` the way `notify` delivers them. */
export const { create } = defineFactory({
	defaults: () => ({}),
	insert: ({ notification, users }: InsertArgs) =>
		NotificationRepository.insert(notification, users),
	applyOptions: async (notification, { createdAt }: Options) => {
		await backdate("Notification", notification.id, { createdAt });
	},
});
