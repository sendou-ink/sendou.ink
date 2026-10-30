const EXIT_ATTRIBUTE = "data-presence";
const PHASE_DURATION_MS = 150;
const EASING = "ease";
const HIDDEN: Keyframe = { opacity: 0, scale: 0.6 };
const SHOWN: Keyframe = { opacity: 1, scale: 1 };

/**
 * Animates the direct children of `container` as they are added and removed:
 * an added one first opens up its width and then fades in, a removed one is
 * put back as an inert ghost (`data-presence="exit"`) doing the reverse.
 * Returns a function that stops observing.
 */
export function observe(container: HTMLElement) {
	const observer = new MutationObserver((records) => {
		if (prefersReducedMotion()) return;

		for (const record of records) {
			for (const node of record.removedNodes) {
				if (node instanceof HTMLElement && !isGhost(node)) {
					exit(container, node, record.nextSibling);
				}
			}
		}
		for (const record of records) {
			for (const node of record.addedNodes) {
				if (node instanceof HTMLElement && node.isConnected && !isGhost(node)) {
					enter(container, node);
				}
			}
		}

		observer.takeRecords();
	});
	observer.observe(container, { childList: true });

	return () => observer.disconnect();
}

function enter(container: HTMLElement, element: HTMLElement) {
	const width = element.getBoundingClientRect().width;
	if (width === 0) return;

	const { open, closed } = sizeKeyframes(container, element, width);
	element.animate(
		[
			{ ...closed, ...HIDDEN },
			{ ...open, ...HIDDEN, offset: 0.5 },
			{ ...open, ...SHOWN },
		],
		{ duration: PHASE_DURATION_MS * 2 },
	);
}

function exit(
	container: HTMLElement,
	element: HTMLElement,
	nextSibling: Node | null,
) {
	element.setAttribute(EXIT_ATTRIBUTE, "exit");
	element.setAttribute("aria-hidden", "true");
	element.inert = true;
	container.insertBefore(
		element,
		nextSibling?.parentNode === container ? nextSibling : null,
	);

	for (const animation of element.getAnimations()) animation.cancel();
	const width = element.getBoundingClientRect().width;
	if (width === 0) {
		element.remove();
		return;
	}

	const { open, closed } = sizeKeyframes(container, element, width);
	element
		.animate(
			[
				{ ...open, ...SHOWN },
				{ ...open, ...HIDDEN, offset: 0.5 },
				{ ...closed, ...HIDDEN },
			],
			{ duration: PHASE_DURATION_MS * 2, fill: "forwards" },
		)
		.finished.catch(() => {})
		.finally(() => element.remove());
}

/** Full and zero width, the latter also cancelling the container's gap next to the element. */
function sizeKeyframes(
	container: HTMLElement,
	element: HTMLElement,
	width: number,
) {
	const open: Keyframe = { width: `${width}px`, easing: EASING };
	const closed: Keyframe = { width: "0px", minWidth: "0px", easing: EASING };

	const marginProperty = element.previousElementSibling
		? "marginInlineStart"
		: element.nextElementSibling
			? "marginInlineEnd"
			: null;
	if (marginProperty) {
		const gap = Number.parseFloat(getComputedStyle(container).columnGap) || 0;
		open[marginProperty] = "0px";
		closed[marginProperty] = `${-gap}px`;
	}

	return { open, closed };
}

function isGhost(element: HTMLElement) {
	return element.hasAttribute(EXIT_ATTRIBUTE);
}

function prefersReducedMotion() {
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
