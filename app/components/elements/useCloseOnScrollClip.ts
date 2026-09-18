import * as React from "react";

const VISIBLE_RATIO_THRESHOLD = 0.98;
/** A visual viewport shorter than the window by more than this is the virtual keyboard, not collapsing browser chrome. */
const KEYBOARD_MIN_HEIGHT = 150;

/**
 * Closes an open popover once scrolling clips it against the sticky header
 * (`--popover-boundary-top`) or the bottom of the viewport.
 *
 * Only scrolling may close: a popover clipped by its own content growing (the
 * moment before anchor positioning flips it into view), one too tall to ever
 * fit fully, or one measured before it is shown must not close itself. The
 * virtual keyboard opening is not scrolling either, even though the browser
 * scrolls the page to keep the focused field in view as it does: a popover
 * left under the keyboard beats one that closes as its own search input is
 * focused.
 */
export function useCloseOnScrollClip(
	isOpen: boolean,
	elementRef: React.RefObject<HTMLElement | null>,
	close: () => void,
) {
	const closeRef = React.useRef(close);
	closeRef.current = close;

	React.useEffect(() => {
		if (!isOpen) return;
		const element = elementRef.current;
		if (!element) return;

		const marginTop =
			Number.parseFloat(
				getComputedStyle(element).getPropertyValue("--popover-boundary-top"),
			) || 0;

		let wasFullyVisible = false;
		let scrolledSinceFullyVisible = false;

		const onScroll = (event: Event) => {
			// the popover scrolling its own content (e.g. a select revealing the
			// selected option) is not the page moving out from under it
			if (event.target instanceof Node && element.contains(event.target)) {
				return;
			}
			if (keyboardIsOpen()) return;
			scrolledSinceFullyVisible = true;
		};
		window.addEventListener("scroll", onScroll, {
			capture: true,
			passive: true,
		});

		// the keyboard can land after the scroll it causes, which then has to be forgotten
		const onViewportResize = () => {
			if (keyboardIsOpen()) {
				scrolledSinceFullyVisible = false;
			}
		};
		window.visualViewport?.addEventListener("resize", onViewportResize);

		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries.at(-1);
				if (!entry) return;
				if (entry.intersectionRatio >= VISIBLE_RATIO_THRESHOLD) {
					wasFullyVisible = true;
					scrolledSinceFullyVisible = false;
				} else if (wasFullyVisible && scrolledSinceFullyVisible) {
					closeRef.current();
				}
			},
			{
				threshold: [0, VISIBLE_RATIO_THRESHOLD],
				rootMargin: `${-marginTop}px 0px 0px 0px`,
			},
		);
		observer.observe(element);

		return () => {
			window.removeEventListener("scroll", onScroll, { capture: true });
			window.visualViewport?.removeEventListener("resize", onViewportResize);
			observer.disconnect();
		};
	}, [isOpen, elementRef]);
}

function keyboardIsOpen() {
	const viewport = window.visualViewport;
	if (!viewport) return false;

	return window.innerHeight - viewport.height > KEYBOARD_MIN_HEIGHT;
}
