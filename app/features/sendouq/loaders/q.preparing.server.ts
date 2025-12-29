import type { LoaderFunctionArgs } from "react-router";
import { requireUserId } from "~/features/auth/core/user.server";
import { SendouQ } from "../core/SendouQ.server";
import { sqRedirectIfNeeded } from "../q-utils.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = await requireUserId(request);

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
