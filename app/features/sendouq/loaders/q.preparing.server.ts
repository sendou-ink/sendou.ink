import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { getUser } from "~/features/auth/core/user.server";
import invariant from "~/utils/invariant";
import { groupRedirectLocationByCurrentLocation } from "../q-utils";
import { findCurrentGroupByUserId } from "../queries/findCurrentGroupByUserId.server";
import { findPreparingGroup } from "../queries/findPreparingGroup.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = await getUser(request);

	const currentGroup = user ? findCurrentGroupByUserId(user.id) : undefined;
	const redirectLocation = groupRedirectLocationByCurrentLocation({
		group: currentGroup,
		currentLocation: "preparing",
	});

	if (redirectLocation) {
		throw redirect(redirectLocation);
	}

	const ownGroup = findPreparingGroup(currentGroup!.id);
	invariant(ownGroup, "No own group found");

	return {
		lastUpdated: new Date().getTime(),
		group: ownGroup,
		role: currentGroup!.role,
	};
};
