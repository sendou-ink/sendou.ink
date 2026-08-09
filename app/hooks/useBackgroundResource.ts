import * as React from "react";

/**
 * Keeps an app shell resource route's JSON fresh, outside the router. A
 * `useFetcher` load that is still in flight when a navigation starts is folded
 * into that navigation and has to settle before it completes (React Router
 * reruns cancelled fetcher loads without consulting `shouldRevalidate`), so a
 * refresh that only feeds the app shell would hold up every page change it
 * happens to overlap with.
 */
export function useBackgroundResource<T>(url: string) {
	const [data, setData] = React.useState<T>();
	const [isLoading, setIsLoading] = React.useState(false);
	const latestRequestRef = React.useRef(0);

	// stable so effects that refresh after a mutation don't re-run every render
	const refresh = React.useCallback(async () => {
		const requestId = ++latestRequestRef.current;
		setIsLoading(true);

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
			if (requestId === latestRequestRef.current) setIsLoading(false);
		}
	}, [url]);

	return { data, isLoading, refresh };
}
