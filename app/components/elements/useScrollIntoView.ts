import * as React from "react";
import { isScrollLocked } from "~/modules/scroll-lock/scroll-lock";
import { keyboardIsOpen } from "~/utils/visual-viewport";
import { floatingBounds } from "./useFloatingLayer";

const PADDING_PROPERTY = "--floating-viewport-padding";

// Brings the anchor of an open popover back on screen if the mobile keyboard opens over it
export function useScrollIntoView(
	isOpen: boolean,
	getAnchor: () => Element | null,
) {
	const getAnchorRef = React.useRef(getAnchor);
	getAnchorRef.current = getAnchor;

	React.useEffect(() => {
		const viewport = window.visualViewport;
		if (!isOpen || !viewport) return;

		const onResize = () => {
			if (!keyboardIsOpen()) return;
			const anchor = getAnchorRef.current();
			if (anchor) {
				revealAboveKeyboard(anchor);
			}
		};

		viewport.addEventListener("resize", onResize);
		return () => viewport.removeEventListener("resize", onResize);
	}, [isOpen]);
}

function revealAboveKeyboard(anchor: Element) {
	anchor.scrollIntoView({ block: "nearest", inline: "nearest" });
	if (isScrollLocked()) return;

	const padding =
		Number.parseFloat(
			getComputedStyle(anchor).getPropertyValue(PADDING_PROPERTY),
		) || 0;
	const bounds = floatingBounds(anchor);
	const rect = anchor.getBoundingClientRect();
	const below = rect.bottom - (bounds.bottom - padding);
	const above = bounds.top + padding - rect.top;

	if (below > 0) {
		window.scrollBy({ top: below });
	} else if (above > 0) {
		window.scrollBy({ top: -above });
	}
}
