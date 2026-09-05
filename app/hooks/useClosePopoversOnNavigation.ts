import * as React from "react";
import { useLocation } from "react-router";
import { DESKTOP_BREAKPOINT, MOBILE_BREAKPOINT } from "./useMainContentWidth";

/**
 * Closes the open popovers in `ref` (the element itself or any inside it) on
 * navigation and when the viewport crosses into another layout. For the
 * popovers of the layout shell, which outlive the page they were opened on.
 * Manual popovers are left alone, their owner decides when they show.
 */
export function useClosePopoversOnNavigation(
	ref: React.RefObject<HTMLElement | null>,
) {
	const { key: locationKey } = useLocation();
	const previousLocationKeyRef = React.useRef(locationKey);

	// hydration must not close a popover opened before it, hence only changes count
	React.useEffect(() => {
		if (previousLocationKeyRef.current === locationKey) return;
		previousLocationKeyRef.current = locationKey;
		hidePopoversWithin(ref.current);
	}, [locationKey, ref]);

	React.useEffect(() => {
		const breakpoints = [MOBILE_BREAKPOINT, DESKTOP_BREAKPOINT].map((width) =>
			window.matchMedia(`(min-width: ${width}px)`),
		);
		const onChange = () => hidePopoversWithin(ref.current);

		for (const breakpoint of breakpoints) {
			breakpoint.addEventListener("change", onChange);
		}
		return () => {
			for (const breakpoint of breakpoints) {
				breakpoint.removeEventListener("change", onChange);
			}
		};
	}, [ref]);
}

function hidePopoversWithin(element: HTMLElement | null) {
	if (!element) return;

	for (const popover of [
		element,
		...element.querySelectorAll<HTMLElement>("[popover]"),
	]) {
		if (popover.popover !== "manual" && popover.matches(":popover-open")) {
			popover.hidePopover();
		}
	}
}
