import type { ActionFunctionArgs } from "@remix-run/node";
import { requireUser } from "~/features/auth/core/user.server";
import { parseRequestPayload } from "~/utils/remix.server";
import * as NotificationRepository from "../NotificationRepository.server";
import { subscribeSchema } from "../notifications-schemas";

export const action = async ({ request }: ActionFunctionArgs) => {
	const user = await requireUser(request);
	const data = await parseRequestPayload({
		request,
		schema: subscribeSchema,
	});

	await NotificationRepository.addSubscription({
		userId: user.id,
		subscription: data,
	});

	return null;
};
