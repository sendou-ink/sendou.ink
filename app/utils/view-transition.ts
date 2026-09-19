import type { ViewTransitionInstance } from "react";

interface PseudoElement {
	getAnimations(): Animation[];
	getComputedStyle(): CSSStyleDeclaration;
}

type PseudoElements = Record<
	"group" | "imagePair" | "old" | "new",
	PseudoElement
>;

const MEASURED_PROPERTIES = ["transform", "width", "height"] as const;

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
		(property, i) => property in from && from[property] !== to[i],
	);
}
