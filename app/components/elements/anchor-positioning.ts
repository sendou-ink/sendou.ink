import * as React from "react";
import { useIsomorphicLayoutEffect } from "~/hooks/useIsomorphicLayoutEffect";

const VIEWPORT_PADDING = 12;
const POSITION_PROPERTIES = [
	"top",
	"right",
	"bottom",
	"left",
	"max-height",
	"width",
];

/** Mirrors the `position-area` values the popovers declare in their CSS. */
export type AnchorPlacement =
	| "top"
	| "bottom"
	| "right"
	| "bottom start"
	| "bottom end";

/** The `position-area` of each block side, per placement. "right" has no block side to pick. */
const POSITION_AREAS: Partial<
	Record<AnchorPlacement, { below: string; above: string }>
> = {
	top: { below: "block-end", above: "block-start" },
	bottom: { below: "block-end", above: "block-start" },
	"bottom start": {
		below: "block-end span-inline-end",
		above: "block-start span-inline-end",
	},
	"bottom end": {
		below: "block-end span-inline-start",
		above: "block-start span-inline-start",
	},
};

/**
 * Opens a popover on the side of its anchor that fits its content, keeping it
 * there for as long as it stays open.
 *
 * Where CSS anchor positioning is supported it only pins the `position-area`,
 * the CSS handles the rest. `position-try-fallbacks` cannot do the picking on
 * its own: it flips only when a side overflows, so a popover capped to the
 * space it has never flips, and one taller than both sides overflows either
 * way and so stays put. Browsers without anchor positioning (Chrome < 125,
 * Safari < 26, Firefox < 147), where the popover would land in the top left
 * corner of the viewport, get positioned here in full.
 */
export function useAnchorPositioning({
	isOpen,
	popoverRef,
	getAnchor,
	placement = "bottom",
	matchAnchorWidth = false,
	constrainHeight = false,
}: {
	isOpen: boolean;
	popoverRef: React.RefObject<HTMLElement | null>;
	getAnchor: () => Element | null;
	placement?: AnchorPlacement;
	/** Take the anchor's width, like the CSS `width: anchor-size(width)` does. */
	matchAnchorWidth?: boolean;
	/** Cap the height to the space on the chosen side. Only for popovers that scroll their content. */
	constrainHeight?: boolean;
}) {
	const getAnchorRef = React.useRef(getAnchor);
	getAnchorRef.current = getAnchor;

	useIsomorphicLayoutEffect(() => {
		const popover = popoverRef.current;
		if (!isOpen || !popover) return;

		const positionArea = POSITION_AREAS[placement];
		const anchorPositioned = CSS.supports("anchor-name: --a");
		if (anchorPositioned && !positionArea) return;

		/** Picked on the first measurement, so growing or shrinking content cannot move the popover. */
		let below: boolean | null = null;

		const position = () => {
			const anchor = getAnchorRef.current();
			// a popover shown after this effect (a controlled one) measures as hidden
			if (!anchor || !popover.matches(":popover-open")) return;

			below ??= opensBelow(popover, anchor, placement);
			popover.dataset.side = below ? "below" : "above";

			if (positionArea && anchorPositioned) {
				popover.style.setProperty(
					"position-area",
					below ? positionArea.below : positionArea.above,
				);
				popover.style.setProperty("position-try-fallbacks", "none");
				return;
			}

			applyStyles(
				popover,
				positionStyles(popover, anchor, {
					below,
					placement,
					matchAnchorWidth,
					constrainHeight,
				}),
			);
		};
		position();

		popover.addEventListener("toggle", position);
		let contentObserver: ResizeObserver | undefined;
		if (!anchorPositioned) {
			// the popover is fixed, so it has to follow an anchor moved by scrolling
			window.addEventListener("scroll", position, {
				capture: true,
				passive: true,
			});
			window.addEventListener("resize", position);
			contentObserver = new ResizeObserver(position);
			contentObserver.observe(popover);
		}

		return () => {
			popover.removeEventListener("toggle", position);
			window.removeEventListener("scroll", position, { capture: true });
			window.removeEventListener("resize", position);
			contentObserver?.disconnect();
			delete popover.dataset.side;
			popover.style.removeProperty("position-area");
			popover.style.removeProperty("position-try-fallbacks");
			applyStyles(popover, {});
		};
	}, [isOpen, popoverRef, placement, matchAnchorWidth, constrainHeight]);
}

/** Keeps to the side the placement asks for, taking the roomier one when the content does not fit there. */
function opensBelow(
	popover: HTMLElement,
	anchor: Element,
	placement: AnchorPlacement,
) {
	const { above, below } = spaceAroundAnchor(
		anchor.getBoundingClientRect(),
		getComputedStyle(popover),
	);

	const prefersBelow = placement !== "top";
	return naturalHeight(popover) <= (prefersBelow ? below : above)
		? prefersBelow
		: below > above;
}

/**
 * Height each side of the anchor has for the popover, its margin and the
 * viewport padding taken out. Above the anchor the sticky header
 * (`--popover-boundary-top`) is the ceiling, not the top of the viewport.
 */
function spaceAroundAnchor(anchorRect: DOMRect, computed: CSSStyleDeclaration) {
	return {
		above:
			anchorRect.top -
			(Number.parseFloat(computed.getPropertyValue("--popover-boundary-top")) ||
				0) -
			VIEWPORT_PADDING -
			Number.parseFloat(computed.marginBottom),
		below:
			window.innerHeight -
			anchorRect.bottom -
			VIEWPORT_PADDING -
			Number.parseFloat(computed.marginTop),
	};
}

/** The height the content wants, which the `max-height` capping it to one side's space hides. */
function naturalHeight(popover: HTMLElement) {
	const capped = popover.style.maxHeight;
	popover.style.setProperty("max-height", "none");
	const height = popover.getBoundingClientRect().height;
	if (capped) {
		popover.style.setProperty("max-height", capped);
	} else {
		popover.style.removeProperty("max-height");
	}
	return height;
}

function positionStyles(
	popover: HTMLElement,
	anchor: Element,
	{
		below,
		placement,
		matchAnchorWidth,
		constrainHeight,
	}: {
		below: boolean;
		placement: AnchorPlacement;
		matchAnchorWidth: boolean;
		constrainHeight: boolean;
	},
) {
	const anchorRect = anchor.getBoundingClientRect();
	const popoverRect = popover.getBoundingClientRect();
	const computed = getComputedStyle(popover);
	const isRtl = computed.direction === "rtl";
	// the margins of the popover offset it from the inset it is given, which is
	// the gap to the anchor in the block axis and drift to undo everywhere else
	const marginTop = Number.parseFloat(computed.marginTop);
	const marginLeft = Number.parseFloat(computed.marginLeft);

	const width = matchAnchorWidth ? anchorRect.width : popoverRect.width;

	const styles: Record<string, string> = matchAnchorWidth
		? { width: px(anchorRect.width) }
		: {};

	if (placement === "right") {
		// inline-end of the anchor, flipping over it like `flip-inline` does
		const height = Math.max(popoverRect.height, popover.scrollHeight);
		const spaceInlineStart = anchorRect.left - VIEWPORT_PADDING;
		const spaceInlineEnd =
			window.innerWidth - anchorRect.right - VIEWPORT_PADDING;
		const [preferred, other] = isRtl
			? [spaceInlineStart, spaceInlineEnd]
			: [spaceInlineEnd, spaceInlineStart];
		const towardsInlineEnd = width <= preferred || preferred >= other;

		return {
			...styles,
			top: px(anchorRect.top + anchorRect.height / 2 - height / 2 - marginTop),
			bottom: "auto",
			...horizontalPlacement(
				towardsInlineEnd !== isRtl ? anchorRect.right : anchorRect.left - width,
				width,
				marginLeft,
			),
		};
	}

	const alignedToAnchorLeft =
		placement === "bottom start"
			? !isRtl
			: placement === "bottom end"
				? isRtl
				: null;
	const left =
		alignedToAnchorLeft === null
			? anchorRect.left + anchorRect.width / 2 - width / 2
			: alignedToAnchorLeft
				? anchorRect.left
				: anchorRect.right - width;

	const side = below ? "below" : "above";

	return {
		...styles,
		...(below
			? { top: px(anchorRect.bottom), bottom: "auto" }
			: { top: "auto", bottom: px(window.innerHeight - anchorRect.top) }),
		...(constrainHeight
			? {
					"max-height": px(
						Math.max(0, spaceAroundAnchor(anchorRect, computed)[side]),
					),
				}
			: {}),
		...horizontalPlacement(left, width, marginLeft),
	};
}

function horizontalPlacement(left: number, width: number, marginLeft: number) {
	const rightmost = Math.max(
		VIEWPORT_PADDING,
		window.innerWidth - VIEWPORT_PADDING - width,
	);

	return {
		left: px(
			Math.min(Math.max(left, VIEWPORT_PADDING), rightmost) - marginLeft,
		),
		right: "auto",
	};
}

/** Writes the positioning properties, clearing the ones the placement leaves out. */
function applyStyles(popover: HTMLElement, styles: Record<string, string>) {
	for (const property of POSITION_PROPERTIES) {
		const value = styles[property];

		if (value === undefined) {
			popover.style.removeProperty(property);
		} else if (popover.style.getPropertyValue(property) !== value) {
			popover.style.setProperty(property, value);
		}
	}
}

function px(value: number) {
	return `${Math.round(value)}px`;
}
