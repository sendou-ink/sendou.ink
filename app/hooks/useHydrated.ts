import * as React from "react";

// credits: https://github.com/sergiodxa/remix-utils/blob/main/src/react/use-hydrated.ts

function subscribe() {
	return () => {};
}

/** False on the server and the hydration render, true from then on (a component mounting later starts with true). */
export function useHydrated() {
	return React.useSyncExternalStore(
		subscribe,
		() => true,
		() => false,
	);
}
