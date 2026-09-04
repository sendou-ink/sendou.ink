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
export type AnchorFallbackPlacement =
	| "top"
	| "bottom"
	| "right"
	| "bottom start"
	| "bottom end";

/**
 * Positions an open popover against its anchor in browsers without CSS anchor
 * positioning (Chrome < 125, Safari < 26, Firefox < 147), where it would
 * otherwise land in the top left corner of the viewport. Does nothing where
 * anchor positioning is supported, the CSS handles the placement there.
 */
export function useAnchorPositionFallback({
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
	placement?: AnchorFallbackPlacement;
	/** Take the anchor's width, like the CSS `width: anchor-size(width)` does. */
	matchAnchorWidth?: boolean;
	/** Cap the height to the space on the chosen side. Only for popovers that scroll their content. */
	constrainHeight?: boolean;
}) {
	const getAnchorRef = React.useRef(getAnchor);
	getAnchorRef.current = getAnchor;

	useIsomorphicLayoutEffect(() => {
		const popover = popoverRef.current;
		if (!isOpen || !popover || CSS.supports("anchor-name: --a")) return;

		const position = () => {
			const anchor = getAnchorRef.current();
			// a popover shown after this effect (a controlled one) measures as hidden
			if (!anchor || !popover.matches(":popover-open")) return;

			applyStyles(
				popover,
				positionStyles(popover, anchor, {
					placement,
					matchAnchorWidth,
					constrainHeight,
				}),
			);
		};
		position();

		popover.addEventListener("toggle", position);
		// the popover is fixed, so it has to follow an anchor moved by scrolling
		window.addEventListener("scroll", position, {
			capture: true,
			passive: true,
		});
		window.addEventListener("resize", position);
		const contentObserver = new ResizeObserver(position);
		contentObserver.observe(popover);

		return () => {
			popover.removeEventListener("toggle", position);
			window.removeEventListener("scroll", position, { capture: true });
			window.removeEventListener("resize", position);
			contentObserver.disconnect();
			applyStyles(popover, {});
		};
	}, [isOpen, popoverRef, placement, matchAnchorWidth, constrainHeight]);
}

function positionStyles(
	popover: HTMLElement,
	anchor: Element,
	{
		placement,
		matchAnchorWidth,
		constrainHeight,
	}: {
		placement: AnchorFallbackPlacement;
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
	const marginBottom = Number.parseFloat(computed.marginBottom);
	const marginLeft = Number.parseFloat(computed.marginLeft);

	const width = matchAnchorWidth ? anchorRect.width : popoverRect.width;
	/** The natural height, which a `max-height` of an earlier pass hides. */
	const height = Math.max(popoverRect.height, popover.scrollHeight);

	const styles: Record<string, string> = matchAnchorWidth
		? { width: px(anchorRect.width) }
		: {};

	if (placement === "right") {
		// inline-end of the anchor, flipping over it like `flip-inline` does
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

	const spaceAbove = anchorRect.top - VIEWPORT_PADDING - marginBottom;
	const spaceBelow =
		window.innerHeight - anchorRect.bottom - VIEWPORT_PADDING - marginTop;

	const prefersBelow = placement !== "top";
	// `flip-block`: keep to the preferred side unless the other one has more room
	const below =
		height <= (prefersBelow ? spaceBelow : spaceAbove)
			? prefersBelow
			: spaceBelow > spaceAbove;

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

	return {
		...styles,
		...(below
			? { top: px(anchorRect.bottom), bottom: "auto" }
			: { top: "auto", bottom: px(window.innerHeight - anchorRect.top) }),
		...(constrainHeight
			? { "max-height": px(Math.max(0, below ? spaceBelow : spaceAbove)) }
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
