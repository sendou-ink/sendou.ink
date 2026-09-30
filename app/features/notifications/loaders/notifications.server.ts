import { requireUser } from "~/features/auth/core/user.server";
import * as NotificationRepository from "../NotificationRepository.server";

export const loader = async () => {
	const user = requireUser();

	return {
		notifications: await NotificationRepository.findByUserId(user.id),
	};
};
