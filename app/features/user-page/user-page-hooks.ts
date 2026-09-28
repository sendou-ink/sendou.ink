import { useMatches } from "react-router";
import { invariant } from "~/utils/invariant";
import type { UserPageLoaderData } from "./loaders/u.$identifier.server";

/** Loader data of the `/u/:identifier` layout route, for its sub pages. */
export function useUserPageLayoutData() {
	const [, layoutRoute] = useMatches();
	invariant(layoutRoute);
	return layoutRoute.loaderData as UserPageLoaderData;
}
