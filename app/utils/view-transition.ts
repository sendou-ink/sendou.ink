import type { ViewTransitionInstance } from "react";
import * as React from "react";

interface PseudoElement {
	getAnimations(): Animation[];
	getComputedStyle(): CSSStyleDeclaration;
}

type PseudoElements = Record<
	"group" | "imagePair" | "old" | "new",
	PseudoElement
>;

const MEASURED_PROPERTIES = ["transform", "width", "height"] as const;
const NUMBER_PATTERN = /-?\d*\.?\d+/g;
const HOVER_CURSOR_PROPERTY = "--hover-cursor";

/** How many modal dialogs are open, provided by the root. */
export const OpenModalsContext = React.createContext<{
	count: number;
	setCount: React.Dispatch<React.SetStateAction<number>>;
}>({ count: 0, setCount: () => {} });
/** Keyframes and computed style serialize lengths at different precisions (209.328px vs 209.312px). */
const SUBPIXEL_TOLERANCE = 0.5;

/**
 * `onUpdate` handler for a `<ViewTransition>` that ends its animation right away when the
 * boundary kept its size and position. React starts an update transition for any DOM change
 * inside the boundary (e.g. a button going disabled) and holds the next render until it ends,
 * so without this a full animation of no visible change would delay every server response.
 */
export function finishUpdateIfUnmoved(instance: ViewTransitionInstance) {
	const pseudos = instance as ViewTransitionInstance & PseudoElements;
	const groupAnimation = pseudos.group.getAnimations()[0];
	if (!groupAnimation || hasMoved(groupAnimation, pseudos.group)) return;

	for (const pseudo of [
		pseudos.group,
		pseudos.imagePair,
		pseudos.old,
		pseudos.new,
	]) {
		for (const animation of pseudo.getAnimations()) {
			animation.finish();
		}
	}
}

function hasMoved(groupAnimation: Animation, group: PseudoElement) {
	const effect = groupAnimation.effect;
	if (!(effect instanceof KeyframeEffect)) return true;

	const [from] = effect.getKeyframes();
	if (!from) return true;

	// while the animation plays the computed style is the animated value, so the end
	// state is only readable with the animation seeked to its end
	const startTime = groupAnimation.currentTime;
	groupAnimation.currentTime = effect.getComputedTiming().endTime ?? 0;
	const style = group.getComputedStyle();
	const to = MEASURED_PROPERTIES.map((property) =>
		style.getPropertyValue(property),
	);
	groupAnimation.currentTime = startTime;

	return MEASURED_PROPERTIES.some(
		(property, i) =>
			property in from && !withinTolerance(String(from[property]), to[i]),
	);
}

function withinTolerance(a: string, b: string) {
	if (a.replace(NUMBER_PATTERN, "") !== b.replace(NUMBER_PATTERN, "")) {
		return false;
	}
	const aNumbers = a.match(NUMBER_PATTERN) ?? [];
	const bNumbers = b.match(NUMBER_PATTERN) ?? [];
	return aNumbers.every(
		(value, i) =>
			Math.abs(Number(value) - Number(bNumbers[i])) <= SUBPIXEL_TOLERANCE,
	);
}

/**
 * Inline style for an element shown in the top layer (a popover or dialog). Snapshots paint above
 * the top layer, so unless the element is captured on its own the page's transitions cover it.
 * `common.css` keeps the capture static and on top of the others.
 */
export function useTopLayerViewTransitionStyle(): React.CSSProperties {
	const uid = React.useId().replace(/[^a-zA-Z0-9-]/g, "");
	return {
		viewTransitionName: `top-layer-${uid}`,
		viewTransitionClass: "top-layer",
	};
}

/**
 * Records the cursor of the hovered element on the root. While a transition runs the browser
 * skips the captured elements when hit testing, so the cursor would fall back to the page's for
 * a few frames; `common.css` shows the recorded one instead.
 */
export function useHoverCursorForViewTransitions() {
	React.useEffect(() => {
		const onPointerOver = (event: PointerEvent) => {
			if (!(event.target instanceof Element)) return;
			document.documentElement.style.setProperty(
				HOVER_CURSOR_PROPERTY,
				getComputedStyle(event.target).cursor,
			);
		};
		document.addEventListener("pointerover", onPointerOver, { passive: true });
		return () => document.removeEventListener("pointerover", onPointerOver);
	}, []);
}

/** Counts the calling dialog as an open modal while `isOpen`, see `usePageViewTransitionClass`. */
export function useReportModalOpen(isOpen: boolean) {
	const { setCount } = React.useContext(OpenModalsContext);

	React.useEffect(() => {
		if (!isOpen) return;
		setCount((count) => count + 1);
		return () => setCount((count) => count - 1);
	}, [isOpen, setCount]);
}

/**
 * The `<ViewTransition>` class for an element of the page: `"none"` while a modal dialog is open.
 * Snapshots paint above the dialog's backdrop, so a transition under it would show the page
 * unblurred for a few frames, and there is nothing worth animating under a modal anyway.
 */
export function usePageViewTransitionClass(className: string) {
	return React.useContext(OpenModalsContext).count > 0 ? "none" : className;
}
