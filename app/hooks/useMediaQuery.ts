import * as React from "react";

const subscribers = new Map<string, (onChange: () => void) => () => void>();

/** Whether the media `query` matches, re-rendering only when the match flips. `serverValue` on the server and the hydration render. */
export function useMediaQuery(query: string, serverValue = false) {
	return React.useSyncExternalStore(
		subscriberFor(query),
		() => window.matchMedia(query).matches,
		() => serverValue,
	);
}

function subscriberFor(query: string) {
	let subscribe = subscribers.get(query);
	if (!subscribe) {
		subscribe = (onChange) => {
			const mediaQueryList = window.matchMedia(query);
			mediaQueryList.addEventListener("change", onChange);
			return () => mediaQueryList.removeEventListener("change", onChange);
		};
		subscribers.set(query, subscribe);
	}
	return subscribe;
}
