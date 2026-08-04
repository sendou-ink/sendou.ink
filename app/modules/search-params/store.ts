const listeners = new Set<() => void>();

let historyPatched = false;

/**
 * Subscribes to changes of the current URL search string, from any write
 * channel: react-router navigations (which call `history.pushState` /
 * `history.replaceState` under the hood), our own `history.replaceState`
 * writes and back/forward navigation.
 *
 * Note that our own `history.replaceState` writes (`loader: false` params) are
 * invisible to react-router: `useLocation()` keeps returning the search string
 * of the last navigation. Read those params through this module's hooks.
 */
export function subscribe(listener: () => void) {
	patchHistoryOnce();
	listeners.add(listener);

	return () => {
		listeners.delete(listener);
	};
}

function notify() {
	for (const listener of listeners) {
		listener();
	}
}

function patchHistoryOnce() {
	if (historyPatched || typeof window === "undefined") return;
	historyPatched = true;

	const originalPushState = window.history.pushState.bind(window.history);
	const originalReplaceState = window.history.replaceState.bind(window.history);

	window.history.pushState = (...args) => {
		originalPushState(...args);
		notify();
	};
	window.history.replaceState = (...args) => {
		originalReplaceState(...args);
		notify();
	};
	window.addEventListener("popstate", notify);
}
