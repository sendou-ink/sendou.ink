import { getUser } from "~/features/auth/core/user.server";
import { resolveLayoutData } from "../core/layout.server";

/** Polled by `LayoutDataProvider` so refreshing the app shell doesn't rerun the current route's loaders. */
export const loader = async () => {
	return resolveLayoutData(getUser());
};
