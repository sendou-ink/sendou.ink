import { requireUser } from "~/features/auth/core/user.server";
import { defineAction } from "~/form/define-action.server";
import * as NotificationRepository from "../NotificationRepository.server";
import { subscribeSchema } from "../notifications-schemas";

export const action = defineAction(
	{ body: subscribeSchema, onInvalidBody: "badRequest" },
	async ({ body }) => {
		requireUser();

		await NotificationRepository.upsertOwnSubscription(body);

		return null;
	},
);
