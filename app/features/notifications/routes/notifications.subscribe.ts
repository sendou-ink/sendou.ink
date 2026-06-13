import type { ActionFunctionArgs } from "react-router";
import { parseRequestPayload } from "~/utils/remix.server";
import * as NotificationRepository from "../NotificationRepository.server";
import { subscribeSchema } from "../notifications-schemas";

export const action = async ({ request }: ActionFunctionArgs) => {
	const data = await parseRequestPayload({
		request,
		schema: subscribeSchema,
	});

	await NotificationRepository.addOwnSubscription(data);

	return null;
};
