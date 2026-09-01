import * as React from "react";

const VISIBLE_RATIO_THRESHOLD = 0.98;

/**
 * Closes an open popover once scrolling clips it against the sticky header
 * (`--popover-boundary-top`) or the bottom of the viewport.
 *
 * A popover too tall to ever fit fully (or one measured before it is shown)
 * must not close itself; only a fully visible popover that scroll clips does.
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
		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries.at(-1);
				if (!entry) return;
				if (entry.intersectionRatio >= VISIBLE_RATIO_THRESHOLD) {
					wasFullyVisible = true;
				} else if (wasFullyVisible) {
					closeRef.current();
				}
			},
			{
				threshold: [0, VISIBLE_RATIO_THRESHOLD],
				rootMargin: `${-marginTop}px 0px 0px 0px`,
			},
		);
		observer.observe(element);

		return () => observer.disconnect();
	}, [isOpen, elementRef]);
}
