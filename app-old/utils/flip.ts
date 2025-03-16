// https://github.com/aholachek/react-flip-toolkit/issues/95#issuecomment-546101332
/**
 * Thin wrapper around Element.animate() that returns a Promise
 * @param el Element to animate
 * @param keyframes The keyframes to use when animating
 * @param options Either the duration of the animation or an options argument detailing how the animation should be performed
 * @returns A promise that will resolve after the animation completes or is cancelled
 */
export function animate(
	el: HTMLElement,
	keyframes: Keyframe[] | PropertyIndexedKeyframes,
	options?: number | KeyframeAnimationOptions,
): Promise<void> {
	return new Promise((resolve) => {
		const anim = el.animate(keyframes, options);
		anim.addEventListener("finish", () => resolve());
		anim.addEventListener("cancel", () => resolve());
	});
}
