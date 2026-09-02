const listeners = new Set<() => void>();

let historyPatched = false;

/**
 * Fires on any search string change: react-router navigations, our own `history.replaceState` writes and
 * back/forward. Our `replaceState` writes (`loader: false`) are invisible to `useLocation()`, so read those
 * params through this module's hooks.
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
