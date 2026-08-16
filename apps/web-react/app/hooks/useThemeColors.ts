import * as React from "react";

function subscribe(listener: () => void) {
	const observer = new MutationObserver(listener);
	observer.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ["class"],
	});
	return () => observer.disconnect();
}

function getSnapshot() {
	return document.documentElement.className;
}

function getServerSnapshot() {
	return null;
}

/**
 * Resolves CSS custom properties to their computed values (e.g. for canvas
 * rendering which can't consume CSS variables directly), re-resolving when the
 * theme class on the root element changes. All values are empty strings during
 * server-side rendering and the initial hydration render.
 */
export function useThemeColors<K extends string>(
	cssVariables: Record<K, string>,
): Record<K, string> {
	const themeClass = React.useSyncExternalStore(
		subscribe,
		getSnapshot,
		getServerSnapshot,
	);

	const style =
		themeClass === null ? null : getComputedStyle(document.documentElement);

	const resolved = {} as Record<K, string>;
	for (const [key, cssVariable] of Object.entries<string>(cssVariables)) {
		resolved[key as K] = style?.getPropertyValue(cssVariable).trim() ?? "";
	}
	return resolved;
}
