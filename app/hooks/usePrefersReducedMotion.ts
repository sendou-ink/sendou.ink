import * as React from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(callback: () => void) {
	const mediaQueryList = window.matchMedia(QUERY);
	mediaQueryList.addEventListener("change", callback);
	return () => mediaQueryList.removeEventListener("change", callback);
}

/**
 * Returns a boolean indicating whether the user has requested reduced motion
 * via the `prefers-reduced-motion` media query. Always returns `false` during
 * server-side rendering and on the first client render.
 */
export function usePrefersReducedMotion() {
	return React.useSyncExternalStore(
		subscribe,
		() => window.matchMedia(QUERY).matches,
		() => false,
	);
}
