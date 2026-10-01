const FLIP_ID_ATTRIBUTE = "data-flip-id";
const MOVE_ANIMATION_ID = "flip-move";
const MOVE_DURATION_MS = 250;
const MIN_MOVE_PX = 0.5;
const EASING = "ease";

interface FlipItem {
	element: HTMLElement;
	rect: DOMRect;
	parent: Element | null;
	nextSibling: Node | null;
}

/** Where each `data-flip-id` element inside a root was on screen. */
export type Snapshot = Map<string, FlipItem>;

export interface PlayOptions {
	/** How long entering items fade in and removed items fade out. */
	fadeDuration?: number;
}

/** Records the on-screen rect of every `data-flip-id` element inside `root`. */
export function snapshot(root: ParentNode): Snapshot {
	const items: Snapshot = new Map();

	for (const element of flipElements(root)) {
		const id = element.getAttribute(FLIP_ID_ATTRIBUTE)!;
		const rect = element.getBoundingClientRect();
		const existing = items.get(id);
		if (existing && isRendered(existing.rect)) continue;

		items.set(id, {
			element,
			rect,
			parent: element.parentElement,
			nextSibling: element.nextSibling,
		});
	}

	return items;
}

/** Animates moved, added and removed `data-flip-id` items since `before`. */
export function play(
	root: ParentNode,
	before: Snapshot,
	{ fadeDuration = MOVE_DURATION_MS }: PlayOptions = {},
) {
	if (prefersReducedMotion()) return;

	for (const element of flipElements(root)) {
		cancelMoveAnimations(element);
	}
	const after = snapshot(root);

	for (const [id, item] of after) {
		const previous = before.get(id);
		if (!previous) {
			fadeIn(item.element, fadeDuration);
			continue;
		}

		slide(item, previous.rect);
	}

	for (const [id, item] of before) {
		if (after.has(id) || item.element.isConnected) continue;

		fadeOutInPlace(item, fadeDuration);
	}
}

function flipElements(root: ParentNode) {
	return root.querySelectorAll<HTMLElement>(`[${FLIP_ID_ATTRIBUTE}]`);
}

function slide(item: FlipItem, from: DOMRect) {
	const to = item.rect;
	if (!isRendered(from) || !isRendered(to)) return;
	if (isOffscreen(from) && isOffscreen(to)) return;

	const dx = from.left - to.left;
	const dy = from.top - to.top;
	if (Math.abs(dx) < MIN_MOVE_PX && Math.abs(dy) < MIN_MOVE_PX) return;

	item.element.animate(
		{ translate: [`${dx}px ${dy}px`, "0 0"] },
		{ id: MOVE_ANIMATION_ID, duration: MOVE_DURATION_MS, easing: EASING },
	);
}

function fadeIn(element: HTMLElement, duration: number) {
	element.animate({ opacity: [0, 1] }, { duration, easing: EASING });
}

/** Puts the removed element back as an inert, absolutely positioned ghost for the length of its fade. */
function fadeOutInPlace(item: FlipItem, duration: number) {
	const { element: ghost, rect, parent, nextSibling } = item;
	if (!parent?.isConnected || !isRendered(rect) || isOffscreen(rect)) return;

	cancelMoveAnimations(ghost);
	ghost.removeAttribute(FLIP_ID_ATTRIBUTE);
	ghost.setAttribute("aria-hidden", "true");
	ghost.inert = true;
	Object.assign(ghost.style, {
		position: "absolute",
		top: "0",
		left: "0",
		width: `${rect.width}px`,
		height: `${rect.height}px`,
		margin: "0",
		boxSizing: "border-box",
		pointerEvents: "none",
	});
	parent.insertBefore(
		ghost,
		nextSibling?.parentNode === parent ? nextSibling : null,
	);

	const placed = ghost.getBoundingClientRect();
	ghost.style.translate = `${rect.left - placed.left}px ${rect.top - placed.top}px`;

	ghost
		.animate(
			{ opacity: [1, 0] },
			{ duration, easing: EASING, fill: "forwards" },
		)
		.finished.catch(() => {})
		.finally(() => ghost.remove());
}

function cancelMoveAnimations(element: HTMLElement) {
	for (const animation of element.getAnimations()) {
		if (animation.id === MOVE_ANIMATION_ID) animation.cancel();
	}
}

function isRendered(rect: DOMRect) {
	return rect.width > 0 || rect.height > 0;
}

function isOffscreen(rect: DOMRect) {
	return rect.bottom < 0 || rect.top > window.innerHeight;
}

function prefersReducedMotion() {
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
