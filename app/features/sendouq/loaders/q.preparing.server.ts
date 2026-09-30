import { requireUser } from "~/features/auth/core/user.server";
import { resolveNotifications } from "~/features/notifications/core/resolve.server";
import { SendouQ, sqRedirectIfNeeded } from "../core/SendouQ.server";

export const loader = async () => {
	const user = requireUser();

	const ownGroup = SendouQ.findOwnGroup(user.id);

	await sqRedirectIfNeeded({
		ownGroup,
		currentLocation: "preparing",
	});

	await resolveNotifications({
		userIds: [user.id],
		type: "SQ_ADDED_TO_GROUP",
	});

	return {
		group: ownGroup!,
	};
};
