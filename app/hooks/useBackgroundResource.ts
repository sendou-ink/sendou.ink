import * as React from "react";

/**
 * Keeps an app shell resource route's JSON fresh outside the router: an in-flight `useFetcher` load is folded
 * into a starting navigation and must settle first, so it would hold up every page change it overlaps.
 * Only a landed response renders; whether a fetch is in flight is read on demand via `isLoading()`.
 */
export function useBackgroundResource<T>(url: string) {
	const [data, setData] = React.useState<T>();
	const inFlightRef = React.useRef(false);
	const latestRequestRef = React.useRef(0);

	// stable so effects refreshing after a mutation don't re-run every render
	const refresh = React.useCallback(async () => {
		const requestId = ++latestRequestRef.current;
		inFlightRef.current = true;

		try {
			const response = await fetch(url);
			if (!response.ok) return;

			const json = (await response.json()) as T;
			// a newer refresh already started, its response is the fresher one
			if (requestId !== latestRequestRef.current) return;

			setData(json);
		} catch {
			// a background refresh failing just leaves the last data in place
		} finally {
			if (requestId === latestRequestRef.current) inFlightRef.current = false;
		}
	}, [url]);

	// stable for the same reason
	const isLoading = React.useCallback(() => inFlightRef.current, []);

	return { data, isLoading, refresh };
}
