import * as React from "react";

const listeners = new Set<() => void>();
let observer: ResizeObserver | null = null;
// read in the observer callback where layout is already clean, never during render
let mainWidth = 0;

function subscribe(listener: () => void) {
	listeners.add(listener);
	if (!observer) {
		observer = new ResizeObserver(([entry]) => {
			const width = (entry.target as HTMLElement).clientWidth;
			if (width === mainWidth) return;

			mainWidth = width;
			for (const notify of listeners) {
				notify();
			}
		});
		const main = document.querySelector("main");
		if (main) observer.observe(main);
	}

	return () => {
		listeners.delete(listener);
		if (listeners.size === 0) {
			observer?.disconnect();
			observer = null;
		}
	};
}

function getSnapshot() {
	return mainWidth;
}

export function useMainContentWidth() {
	return React.useSyncExternalStore(subscribe, getSnapshot, () => 0);
}
