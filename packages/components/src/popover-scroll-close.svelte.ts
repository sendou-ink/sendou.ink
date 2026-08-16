import { ElementVisibility } from "./element-visibility.ts";

const VISIBLE_RATIO_THRESHOLD = 0.98;

export interface PopoverScrollCloseOptions {
	isOpen: () => boolean;
	element: () => HTMLElement | null;
	close: () => void;
}

/**
 * Closes an open popover once scrolling clips it against the sticky header
 * (`--popover-boundary-top`) or the bottom of the viewport.
 *
 * A popover too tall to ever fit fully (or one measured before it is shown)
 * must not close itself; only a fully visible popover that scroll clips does.
 * Must be called during component initialisation.
 */
export function closePopoverOnScrollClip(options: PopoverScrollCloseOptions) {
	const visibility = new ElementVisibility(() => {
		const element = options.element();
		if (!options.isOpen() || !element) return null;
		return {
			element,
			marginTop: popoverBoundaryTop(element),
			threshold: VISIBLE_RATIO_THRESHOLD,
		};
	});

	let wasFullyVisible = false;

	$effect(() => {
		if (!options.isOpen()) {
			wasFullyVisible = false;
			return;
		}

		const ratio = visibility.ratio;
		if (ratio === null) return;

		if (ratio >= VISIBLE_RATIO_THRESHOLD) {
			wasFullyVisible = true;
		} else if (wasFullyVisible) {
			options.close();
		}
	});
}

function popoverBoundaryTop(element: Element) {
	return (
		Number.parseFloat(
			getComputedStyle(element).getPropertyValue("--popover-boundary-top"),
		) || 0
	);
}
