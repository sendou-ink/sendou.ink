import { IS_DEV_BUILD } from "~/utils/dev-build";
import { forbidden, notFound } from "~/utils/remix.server";

/**
 * Every dev tools loader and action starts with this. The routes are only registered on the dev server, this
 * is the second lock: a 404 outside a dev build, and a 403 for a request another site's page made the browser
 * send (the dev server listens on localhost, which any open tab can reach). Requests from the toolbar are
 * same-origin, links opened from a terminal and CLI requests carry no `Sec-Fetch-Site` at all or `none`.
 */
export function requireDevTools(request: Request) {
	if (!IS_DEV_BUILD || process.env.NODE_ENV === "production") notFound();

	const fetchSite = request.headers.get("Sec-Fetch-Site");
	if (fetchSite === "cross-site" || fetchSite === "same-site") forbidden();
}
