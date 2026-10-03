const listeners = new Set<() => void>();

/**
 * Fires on our own `history.replaceState` writes (`loader: false`), which are invisible to `useLocation()`.
 * Router navigations (including back/forward) are not notified here: consumers rerender through `useLocation()`,
 * in the same commit as the router, so the new params never paint ahead of the route (and its scroll reset).
 */
export function subscribe(listener: () => void) {
	listeners.add(listener);

	return () => {
		listeners.delete(listener);
	};
}

export function notify() {
	for (const listener of listeners) {
		listener();
	}
}
