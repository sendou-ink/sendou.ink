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
 * Computed values of CSS custom properties (e.g. for canvas), re-resolved when the root theme class
 * changes. Empty strings on the server and the hydration render.
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
