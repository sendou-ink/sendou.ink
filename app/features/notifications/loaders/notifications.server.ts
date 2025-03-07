import type { LoaderFunctionArgs } from "@remix-run/node";
import { requireUserId } from "~/features/auth/core/user.server";
import * as NotificationRepository from "../NotificationRepository.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = await requireUserId(request);

	return {
		notifications: await NotificationRepository.findByUserId(user.id),
	};
};
