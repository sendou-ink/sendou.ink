import * as React from "react";
import { logger } from "~/utils/logger";

/**
 * Full screen through the Fullscreen API, left when the planner goes away. It is the whole page
 * that goes full screen (the planner already covers it), so everything drawn over the planner
 * outside of it, like the token dragged from the weapon picker, stays visible.
 * `isSupported` is `false` where the API is missing, e.g. on iPhones.
 */
export function useFullScreen() {
	const isFullScreen = React.useSyncExternalStore(
		subscribe,
		() => document.fullscreenElement !== null,
		() => false,
	);

	React.useEffect(
		() => () => {
			if (document.fullscreenElement) exit();
		},
		[],
	);

	return {
		isSupported: typeof document !== "undefined" && document.fullscreenEnabled,
		isFullScreen,
		toggle: () => {
			if (document.fullscreenElement) {
				exit();
				return;
			}

			document.documentElement.requestFullscreen().catch((error) => {
				logger.error("Failed to enter full screen", error);
			});
		},
	};
}

function subscribe(listener: () => void) {
	document.addEventListener("fullscreenchange", listener);
	return () => document.removeEventListener("fullscreenchange", listener);
}

function exit() {
	document.exitFullscreen().catch((error) => {
		logger.error("Failed to exit full screen", error);
	});
}
