import { getUser } from "~/features/auth/core/user.server";
import { resolveLayoutData } from "../core/layout.server";

/**
 * The parts of the root loader that go stale on their own while a page sits
 * open. Polled by `LayoutDataProvider` so keeping them fresh does not mean
 * rerunning every loader of whatever route the user happens to be on.
 */
export const loader = async () => {
	return resolveLayoutData(getUser());
};
