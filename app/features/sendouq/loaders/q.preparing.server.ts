import { requireUser } from "~/features/auth/core/user.server";
import { resolveNotifications } from "~/features/notifications/core/resolve.server";
import { SendouQ } from "../core/SendouQ.server";
import { sqRedirectIfNeeded } from "../q-utils.server";

export const loader = async () => {
	const user = requireUser();

	const ownGroup = SendouQ.findOwnGroup(user.id);

	sqRedirectIfNeeded({
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
