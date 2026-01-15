import { requireUser } from "~/features/auth/core/user.server";
import { SendouQ } from "../core/SendouQ.server";
import { sqRedirectIfNeeded } from "../q-utils.server";

export const loader = async () => {
	const user = requireUser();

	const ownGroup = SendouQ.findOwnGroup(user.id);

	sqRedirectIfNeeded({
		ownGroup,
		currentLocation: "preparing",
	});

	return {
		lastUpdated: Date.now(),
		group: ownGroup!,
	};
};
