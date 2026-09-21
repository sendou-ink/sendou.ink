import * as React from "react";
import { useIsomorphicLayoutEffect } from "~/hooks/useIsomorphicLayoutEffect";
import { visibleViewportRect } from "~/utils/visual-viewport";
import * as FloatingLayer from "./floating-layer";

const GAP_PROPERTY = "--floating-gap";
const PADDING_PROPERTY = "--floating-viewport-padding";
const CEILING_PROPERTY = "--popover-boundary-top";
const FLOOR_PROPERTY = "--popover-boundary-bottom";

const AVAILABLE_WIDTH_PROPERTY = "--floating-available-width";
const AVAILABLE_HEIGHT_PROPERTY = "--floating-available-height";
const ANCHOR_WIDTH_PROPERTY = "--floating-anchor-width";
const ANCHOR_HEIGHT_PROPERTY = "--floating-anchor-height";
const TRANSFORM_ORIGIN_PROPERTY = "--floating-transform-origin";

const OUTPUT_PROPERTIES = [
	AVAILABLE_WIDTH_PROPERTY,
	AVAILABLE_HEIGHT_PROPERTY,
	ANCHOR_WIDTH_PROPERTY,
	ANCHOR_HEIGHT_PROPERTY,
	TRANSFORM_ORIGIN_PROPERTY,
];

const INSET_PROPERTIES = ["top", "right", "bottom", "left"] as const;
const UNCAPPED = "10000000px";

export type FloatingPlacement = FloatingLayer.Placement;

export function useFloatingLayer({
	isOpen,
	floatingRef,
	getAnchor,
	placement = "bottom",
}: {
	isOpen: boolean;
	floatingRef: React.RefObject<HTMLElement | null>;
	getAnchor: () => Element | null;
	placement?: FloatingPlacement;
}) {
	const getAnchorRef = React.useRef(getAnchor);
	getAnchorRef.current = getAnchor;

	useIsomorphicLayoutEffect(() => {
		const floating = floatingRef.current;
		if (!isOpen || !floating) return;

		let natural: FloatingLayer.Size | null = null;
		let lastBounds: FloatingLayer.Bounds | null = null;
		let lastResolution: FloatingLayer.Resolution | null = null;
		let viewportAnchored: boolean | null = null;
		let frameId: number | null = null;

		const update = () => {
			const anchor = getAnchorRef.current();
			if (!anchor || !floating.matches(":popover-open")) return;

			if (viewportAnchored === null) {
				viewportAnchored = isViewportAnchored(anchor);
				floating.style.position = viewportAnchored ? "fixed" : "absolute";
			}

			const computed = getComputedStyle(floating);
			const gap = lengthOf(computed, GAP_PROPERTY);
			const padding = lengthOf(computed, PADDING_PROPERTY);
			const rtl = computed.direction === "rtl";
			const bounds = floatingBounds(floating);
			const anchorRect = anchor.getBoundingClientRect();
			const detached = isAnchorDetached(
				anchor,
				anchorRect,
				computed,
				viewportAnchored,
			);
			floating.style.visibility = detached ? "hidden" : "";
			if (detached) return;

			floating.style.setProperty(ANCHOR_WIDTH_PROPERTY, px(anchorRect.width));
			floating.style.setProperty(ANCHOR_HEIGHT_PROPERTY, px(anchorRect.height));

			if (natural === null || !sameBounds(bounds, lastBounds)) {
				lastBounds = bounds;
				natural = naturalSize(floating, bounds, placement, padding);
				lastResolution = null;
			}

			const resolution = FloatingLayer.resolve({
				anchor: anchorRect,
				floating: natural,
				bounds,
				placement,
				gap,
				padding,
				rtl,
			});
			if (!sameResolution(resolution, lastResolution)) {
				lastResolution = resolution;
				floating.style.setProperty(
					AVAILABLE_WIDTH_PROPERTY,
					px(Math.floor(resolution.availableWidth)),
				);
				floating.style.setProperty(
					AVAILABLE_HEIGHT_PROPERTY,
					px(Math.floor(resolution.availableHeight)),
				);
				floating.style.setProperty(
					TRANSFORM_ORIGIN_PROPERTY,
					resolution.transformOrigin,
				);
				floating.dataset.side = resolution.side;
				floating.dataset.align = resolution.align;
			}

			const root = document.documentElement;
			const viewportInsets = FloatingLayer.insets({
				anchor: anchorRect,
				floating: floating.getBoundingClientRect(),
				bounds,
				side: resolution.side,
				align: resolution.align,
				gap,
				padding,
				rtl,
				viewport: { width: root.clientWidth, height: root.clientHeight },
			});
			const insets = viewportAnchored
				? viewportInsets
				: FloatingLayer.documentInsets(viewportInsets, {
						x: window.scrollX,
						y: window.scrollY,
					});
			for (const property of INSET_PROPERTIES) {
				const value = insets[property];
				floating.style.setProperty(
					property,
					value === null ? "auto" : px(roundToDevicePixels(value)),
				);
			}
		};
		update();

		const scheduleUpdate = () => {
			if (frameId !== null) return;
			frameId = requestAnimationFrame(() => {
				frameId = null;
				update();
			});
		};
		const onScroll = (event: Event) => {
			if (event.target instanceof Node && floating.contains(event.target)) {
				return;
			}
			update();
		};

		const resizeObserver = new ResizeObserver(scheduleUpdate);
		resizeObserver.observe(floating);
		const anchor = getAnchorRef.current();
		if (anchor) {
			resizeObserver.observe(anchor);
		}

		floating.addEventListener("toggle", update);
		window.addEventListener("scroll", onScroll, {
			capture: true,
			passive: true,
		});
		window.addEventListener("resize", scheduleUpdate);
		window.visualViewport?.addEventListener("resize", scheduleUpdate);
		window.visualViewport?.addEventListener("scroll", scheduleUpdate);

		return () => {
			resizeObserver.disconnect();
			floating.removeEventListener("toggle", update);
			window.removeEventListener("scroll", onScroll, { capture: true });
			window.removeEventListener("resize", scheduleUpdate);
			window.visualViewport?.removeEventListener("resize", scheduleUpdate);
			window.visualViewport?.removeEventListener("scroll", scheduleUpdate);
			if (frameId !== null) {
				cancelAnimationFrame(frameId);
			}
			for (const property of [
				"position",
				"visibility",
				...INSET_PROPERTIES,
				...OUTPUT_PROPERTIES,
			]) {
				floating.style.removeProperty(property);
			}
			delete floating.dataset.side;
			delete floating.dataset.align;
		};
	}, [isOpen, floatingRef, placement]);
}

function naturalSize(
	floating: HTMLElement,
	bounds: FloatingLayer.Bounds,
	placement: FloatingPlacement,
	padding: number,
): FloatingLayer.Size {
	const vertical = FloatingLayer.isVerticalPlacement(placement);

	floating.style.setProperty(
		vertical ? AVAILABLE_WIDTH_PROPERTY : AVAILABLE_HEIGHT_PROPERTY,
		px(FloatingLayer.spaceAcross(bounds, placement, padding)),
	);
	floating.style.setProperty(
		vertical ? AVAILABLE_HEIGHT_PROPERTY : AVAILABLE_WIDTH_PROPERTY,
		UNCAPPED,
	);

	const { width, height } = floating.getBoundingClientRect();

	return { width, height };
}

export function floatingBounds(element: Element): FloatingLayer.Bounds {
	const computed = getComputedStyle(element);
	const visible = visibleViewportRect();
	const layoutHeight = document.documentElement.clientHeight;

	return {
		top: Math.max(visible.top, lengthOf(computed, CEILING_PROPERTY)),
		right: visible.right,
		bottom: Math.min(
			visible.bottom,
			layoutHeight - lengthOf(computed, FLOOR_PROPERTY),
		),
		left: visible.left,
	};
}

function isAnchorDetached(
	anchor: Element,
	anchorRect: DOMRect,
	computed: CSSStyleDeclaration,
	viewportAnchored: boolean,
) {
	const root = document.documentElement;

	let top = viewportAnchored ? 0 : lengthOf(computed, CEILING_PROPERTY);
	let right = root.clientWidth;
	let bottom =
		root.clientHeight -
		(viewportAnchored ? 0 : lengthOf(computed, FLOOR_PROPERTY));
	let left = 0;

	let element = anchor.parentElement;
	while (element !== null && element !== document.body) {
		if (getComputedStyle(element).overflow !== "visible") {
			const rect = element.getBoundingClientRect();

			top = Math.max(top, rect.top);
			right = Math.min(right, rect.right);
			bottom = Math.min(bottom, rect.bottom);
			left = Math.max(left, rect.left);
		}
		element = element.parentElement;
	}

	return (
		anchorRect.bottom <= top ||
		anchorRect.top >= bottom ||
		anchorRect.right <= left ||
		anchorRect.left >= right
	);
}

function isViewportAnchored(anchor: Element) {
	let element: Element | null = anchor;
	while (element !== null && element !== document.body) {
		const position = getComputedStyle(element).position;
		if (position === "fixed" || position === "sticky") return true;

		element = element.parentElement;
	}

	return false;
}

function sameBounds(a: FloatingLayer.Bounds, b: FloatingLayer.Bounds | null) {
	return (
		b !== null &&
		a.top === b.top &&
		a.right === b.right &&
		a.bottom === b.bottom &&
		a.left === b.left
	);
}

function sameResolution(
	a: FloatingLayer.Resolution,
	b: FloatingLayer.Resolution | null,
) {
	return (
		b !== null &&
		a.side === b.side &&
		a.align === b.align &&
		Math.floor(a.availableWidth) === Math.floor(b.availableWidth) &&
		Math.floor(a.availableHeight) === Math.floor(b.availableHeight) &&
		a.transformOrigin === b.transformOrigin
	);
}

function lengthOf(computed: CSSStyleDeclaration, property: string) {
	return Number.parseFloat(computed.getPropertyValue(property)) || 0;
}

function roundToDevicePixels(value: number) {
	const ratio = window.devicePixelRatio || 1;
	return Math.round(value * ratio) / ratio;
}

function px(value: number) {
	return `${value}px`;
}
