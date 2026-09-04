import * as React from "react";

const VISIBLE_RATIO_THRESHOLD = 0.98;

// xxx: follow our hook file convention

/**
 * Closes an open popover once scrolling clips it against the sticky header
 * (`--popover-boundary-top`) or the bottom of the viewport.
 *
 * Only scrolling may close: a popover clipped by its own content growing (the
 * moment before anchor positioning flips it into view), one too tall to ever
 * fit fully, or one measured before it is shown must not close itself.
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

		const onScroll = () => {
			scrolledSinceFullyVisible = true;
		};
		window.addEventListener("scroll", onScroll, {
			capture: true,
			passive: true,
		});

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
			observer.disconnect();
		};
	}, [isOpen, elementRef]);
}
