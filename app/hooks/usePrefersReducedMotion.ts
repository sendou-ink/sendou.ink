import * as React from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(callback: () => void) {
	const mediaQueryList = window.matchMedia(QUERY);
	mediaQueryList.addEventListener("change", callback);
	return () => mediaQueryList.removeEventListener("change", callback);
}

/** `prefers-reduced-motion` media query; `false` on the server and the first client render. */
export function usePrefersReducedMotion() {
	return React.useSyncExternalStore(
		subscribe,
		() => window.matchMedia(QUERY).matches,
		() => false,
	);
}
