import * as React from "react";

interface WindowSize {
	width: number;
	height: number;
}

function subscribe(listener: () => void) {
	window.addEventListener("resize", listener);
	return () => window.removeEventListener("resize", listener);
}

/** Window dimensions, re-rendering on resize. `0` on the server and the hydration render. */
export function useWindowSize(): WindowSize {
	const width = React.useSyncExternalStore(
		subscribe,
		() => window.innerWidth,
		() => 0,
	);
	const height = React.useSyncExternalStore(
		subscribe,
		() => window.innerHeight,
		() => 0,
	);

	return { width, height };
}
