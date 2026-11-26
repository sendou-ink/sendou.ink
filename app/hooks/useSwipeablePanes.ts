import * as React from "react";
import * as R from "remeda";
import { useIsomorphicLayoutEffect } from "./useIsomorphicLayoutEffect";
import { useLatestRef } from "./useLatestRef";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

/** Marks a pane of the strip, its value is the pane's key. */
const PANE_ATTRIBUTE = "data-pane";

/**
 * A horizontal scroll-snap strip of full-width panes swiped between, with a tab list that follows it: the pane
 * scrolled into view becomes the selection and `scrollToPane` (for tab clicks) scrolls to a pane.
 *
 * Spread `stripProps` on the scroll container and mark every pane inside it with `data-pane="<key>"`. The strip's
 * layout (`overflow-x: auto`, `scroll-snap-type`, full-width panes) is the caller's CSS, so it can be mobile only.
 * `layoutRef` goes on the element holding both the tab list and the strip: landing on another pane while scrolled
 * past the tabs scrolls the page back up to it, as panes differ in height.
 *
 * The strip stays on the selected pane when the selection changes from elsewhere, panes come and go or the strip
 * is resized.
 */
export function useSwipeablePanes({
	selectedKey,
	onSelectionChange,
}: {
	selectedKey: string | null;
	onSelectionChange: (key: string) => void;
}) {
	const layoutRef = React.useRef<HTMLDivElement>(null);
	const stripRef = React.useRef<HTMLDivElement>(null);
	const clickedPaneRef = React.useRef<string | null>(null);
	const settledPaneRef = React.useRef(selectedKey);
	const isTouchingRef = React.useRef(false);
	const knownSelectedKeyRef = React.useRef(selectedKey);
	const paneKeysRef = React.useRef<string | null>(null);
	const prefersReducedMotion = usePrefersReducedMotion();

	const select = (key: string) => {
		knownSelectedKeyRef.current = key;
		if (key !== selectedKey) onSelectionChange(key);
	};

	const scrollToPane = (key: string) => {
		select(key);

		const strip = stripRef.current;
		const pane = strip ? findPane(strip, key) : null;
		if (!strip || !pane) return;

		const offset = offsetFromStripStart(strip, pane);
		const willScroll =
			Math.abs(offset) >= 1 && strip.scrollWidth > strip.clientWidth;
		// the panes passed on the way would otherwise each take the tab for a moment
		clickedPaneRef.current = willScroll ? key : null;

		strip.scrollBy({
			left: offset,
			behavior: prefersReducedMotion ? "instant" : "smooth",
		});
	};

	const alignToSelectedPane = () => {
		const strip = stripRef.current;
		if (!strip || !selectedKey) return;
		if (isTouchingRef.current || clickedPaneRef.current) return;

		const pane = findPane(strip, selectedKey);
		if (!pane) return;

		settledPaneRef.current = selectedKey;
		const offset = offsetFromStripStart(strip, pane);
		if (Math.abs(offset) < 1) return;

		strip.scrollBy({ left: offset, behavior: "instant" });
	};

	useIsomorphicLayoutEffect(() => {
		const strip = stripRef.current;
		if (!strip) return;

		const paneKeys = panesOf(strip)
			.map((pane) => pane.getAttribute(PANE_ATTRIBUTE))
			.join(",");
		const havePanesChanged = paneKeys !== paneKeysRef.current;
		const isSelectedFromElsewhere = selectedKey !== knownSelectedKeyRef.current;
		paneKeysRef.current = paneKeys;
		knownSelectedKeyRef.current = selectedKey;

		if (havePanesChanged || isSelectedFromElsewhere) alignToSelectedPane();
	});

	const alignToSelectedPaneRef = useLatestRef(alignToSelectedPane);
	React.useEffect(() => {
		const strip = stripRef.current;
		if (!strip) return;

		let width = strip.clientWidth;
		const observer = new ResizeObserver(() => {
			if (strip.clientWidth === width) return;

			width = strip.clientWidth;
			// a resize cuts a tab click's scroll short, its scroll events may never come
			clickedPaneRef.current = null;
			alignToSelectedPaneRef.current();
		});
		observer.observe(strip);

		return () => observer.disconnect();
	}, []);

	const selectPaneInView = () => {
		const strip = stripRef.current;
		if (!strip) return;

		const paneInView = closestPane(strip)?.getAttribute(PANE_ATTRIBUTE);
		if (!paneInView) return;

		if (clickedPaneRef.current) {
			if (paneInView === clickedPaneRef.current) clickedPaneRef.current = null;
			return;
		}

		select(paneInView);
	};

	const scrollUpToSettledPane = () => {
		if (isTouchingRef.current) return;

		const layout = layoutRef.current;
		const strip = stripRef.current;
		if (!layout?.isConnected || !strip) return;

		const pane = closestPane(strip);
		const isAtRest = pane && Math.abs(offsetFromStripStart(strip, pane)) < 1;
		if (!isAtRest) return;

		const paneKey = pane.getAttribute(PANE_ATTRIBUTE);
		if (paneKey === settledPaneRef.current) return;
		settledPaneRef.current = paneKey;

		const stickyHeaderHeight = Number.parseFloat(
			getComputedStyle(document.documentElement).scrollPaddingTop,
		);
		const tabList = layout.querySelector("[role='tablist']");
		const areTabsInView =
			tabList &&
			tabList.getBoundingClientRect().bottom > (stickyHeaderHeight || 0);
		if (areTabsInView) return;

		layout.scrollIntoView({
			block: "start",
			inline: "nearest",
			behavior: prefersReducedMotion ? "instant" : "smooth",
		});
	};

	// selects right away as a swipe cancelling a tab click's scroll before it moved fires no scroll event
	const releaseClickedPane = () => {
		clickedPaneRef.current = null;
		selectPaneInView();
	};

	const endTouch = () => {
		isTouchingRef.current = false;
		scrollUpToSettledPane();
	};

	return {
		layoutRef,
		scrollToPane,
		stripProps: {
			ref: stripRef,
			onScroll: () => {
				selectPaneInView();
				scrollUpToSettledPane();
			},
			onScrollEnd: () => {
				releaseClickedPane();
				scrollUpToSettledPane();
			},
			onPointerDown: releaseClickedPane,
			onTouchStart: () => {
				isTouchingRef.current = true;
				releaseClickedPane();
			},
			onTouchEnd: endTouch,
			onTouchCancel: endTouch,
			onWheel: releaseClickedPane,
		},
	};
}

function panesOf(strip: HTMLElement) {
	return [...strip.querySelectorAll<HTMLElement>(`[${PANE_ATTRIBUTE}]`)];
}

function findPane(strip: HTMLElement, key: string) {
	return panesOf(strip).find(
		(pane) => pane.getAttribute(PANE_ATTRIBUTE) === key,
	);
}

function closestPane(strip: HTMLElement) {
	return R.firstBy(panesOf(strip), (pane) =>
		Math.abs(offsetFromStripStart(strip, pane)),
	);
}

function offsetFromStripStart(strip: HTMLElement, element: Element) {
	return (
		element.getBoundingClientRect().left - strip.getBoundingClientRect().left
	);
}
