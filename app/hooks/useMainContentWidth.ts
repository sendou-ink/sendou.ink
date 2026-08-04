import * as React from "react";
import { useWindowSize } from "./useWindowSize";

const MOBILE_BREAKPOINT = 600;
const DESKTOP_BREAKPOINT = 1000;

type LayoutSize = "mobile" | "tablet" | "desktop";

export function useLayoutSize(): LayoutSize {
	const { width } = useWindowSize();

	if (width === 0) return "desktop";
	if (width < MOBILE_BREAKPOINT) return "mobile";
	if (width < DESKTOP_BREAKPOINT) return "tablet";
	return "desktop";
}

const listeners = new Set<() => void>();
let observer: ResizeObserver | null = null;

function subscribe(listener: () => void) {
	listeners.add(listener);
	if (!observer) {
		observer = new ResizeObserver(() => {
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
	return document.querySelector("main")?.clientWidth ?? 0;
}

export function useMainContentWidth() {
	return React.useSyncExternalStore(subscribe, getSnapshot, () => 0);
}
