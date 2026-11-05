/** Key of an action result opting out of the revalidation that follows it (read by the patched `shouldRevalidateLoader`). */
export const REVALIDATE_KEY = "__revalidate";

/** Request header carrying the page (path + search) a mutation was submitted from, its revalidation runs for it. */
export const PAGE_HEADER = "X-Revalidate-Page";
/** Request header carrying the comma separated ids of the routes whose loaders revalidate after a successful mutation. */
export const ROUTES_HEADER = "X-Revalidate-Routes";
/** Response header marking a mutation response with the revalidation's loader data appended after a newline. */
export const SINGLE_FLIGHT_HEADER = "X-Single-Flight";

/**
 * Action result that revalidates no loaders, for actions (or branches of one) that change nothing the page shows.
 * Without it every loader of the page reruns after the action.
 *
 * @example
 * return Revalidation.none();
 * return Revalidation.none({ ok: true });
 */
export function none<T extends object = Record<never, never>>(
	result?: T,
): T & { [REVALIDATE_KEY]: false } {
	return { ...(result as T), [REVALIDATE_KEY]: false };
}

/** The single fetch (`.data`) path React Router loads the loaders of `pagePath` (path + search) from. */
export function dataPathOf(pagePath: string) {
	const url = new URL(pagePath, "http://localhost");
	url.pathname = url.pathname.endsWith("/")
		? `${url.pathname}_.data`
		: `${url.pathname}.data`;
	url.searchParams.delete("index");

	return url.pathname + url.search;
}
