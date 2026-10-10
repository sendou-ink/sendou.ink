import * as React from "react";

const listeners = new Set<() => void>();
let observer: ResizeObserver | null = null;
let observedMain: Element | null = null;
// read in the observer callback where layout is already clean, never during render
let mainWidth = 0;

function subscribe(listener: () => void) {
	listeners.add(listener);
	if (!observer) {
		observer = new ResizeObserver(([entry]) => {
			// a subscriber outside the page (e.g. chat sidebar) keeps the observer alive across navigations
			if (!entry.target.isConnected) {
				observeCurrentMain();
				return;
			}

			const width = (entry.target as HTMLElement).clientWidth;
			if (width === mainWidth) return;

			mainWidth = width;
			for (const notify of listeners) {
				notify();
			}
		});
	}
	observeCurrentMain();

	return () => {
		listeners.delete(listener);
		if (listeners.size === 0) {
			observer?.disconnect();
			observer = null;
			observedMain = null;
		}
	};
}

function observeCurrentMain() {
	const main = document.querySelector("main");
	if (!observer || main === observedMain) return;

	if (observedMain) observer.unobserve(observedMain);
	observedMain = main;
	if (main) observer.observe(main);
}

function getSnapshot() {
	return mainWidth;
}

export function useMainContentWidth() {
	return React.useSyncExternalStore(subscribe, getSnapshot, () => 0);
}
