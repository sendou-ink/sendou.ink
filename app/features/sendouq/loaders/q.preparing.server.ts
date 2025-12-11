import type { LoaderFunctionArgs } from "@remix-run/node";
import { requireUserId } from "~/features/auth/core/user.server";
import { SQManager } from "../core/SQManager.server";
import { sqRedirectIfNeeded } from "../q-utils";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = await requireUserId(request);

	const ownGroup = SQManager.findOwnGroup(user.id);

	sqRedirectIfNeeded({
		ownGroup,
		currentLocation: "preparing",
	});

	return {
		lastUpdated: Date.now(),
		group: ownGroup!,
	};
};
