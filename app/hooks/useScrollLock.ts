import * as React from "react";
import { lockScroll } from "~/modules/scroll-lock/scroll-lock";

export function useScrollLock(locked: boolean) {
	React.useEffect(() => {
		if (!locked) return;
		return lockScroll();
	}, [locked]);
}

// Same as `useScrollLock` but specifically for native elements like dialor or popover
export function useScrollLockWhileOpen(
	ref: React.RefObject<HTMLElement | null>,
) {
	React.useEffect(() => {
		const element = ref.current;
		if (!element) return;

		let release: (() => void) | undefined;
		const syncLock = (isOpen: boolean) => {
			if (isOpen) {
				release ??= lockScroll();
			} else {
				release?.();
				release = undefined;
			}
		};
		const onToggle = (event: Event) => {
			syncLock((event as ToggleEvent).newState === "open");
		};

		element.addEventListener("toggle", onToggle);
		syncLock(isElementOpen(element));
		return () => {
			element.removeEventListener("toggle", onToggle);
			syncLock(false);
		};
	}, [ref]);
}

function isElementOpen(element: HTMLElement) {
	return element instanceof HTMLDialogElement
		? element.open
		: element.matches(":popover-open");
}
