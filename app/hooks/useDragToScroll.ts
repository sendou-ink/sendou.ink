import * as React from "react";

const DRAG_ACTIVATION_DISTANCE_PX = 10;
const MOMENTUM_DECAY_PER_FRAME = 0.95;
const MOMENTUM_MIN_SPEED_PX_PER_MS = 0.05;
const MOMENTUM_FRAME_MS = 1000 / 60;
const VELOCITY_IDLE_TIMEOUT_MS = 100;

/**
 * Makes an element with overflowing content scrollable by dragging with the
 * mouse. Returns the ref to attach to the scrollable element.
 */
export function useDragToScroll<
	T extends HTMLElement,
>(): React.RefObject<T | null> {
	const ref = React.useRef<T>(null);

	React.useEffect(() => {
		if (!ref.current) return;

		return dragToScroll(ref.current);
	}, []);

	return ref;
}

/**
 * Attaches mouse drag-to-scroll behavior with release momentum to an element,
 * returning a cleanup function. A grabbing cursor is shown while dragging and
 * clicks that conclude a drag are suppressed.
 * Framework-agnostic on purpose (usable as a Svelte attachment as is).
 */
export function dragToScroll(element: HTMLElement): () => void {
	let grabbingCursorStyle: HTMLStyleElement | null = null;
	let isMouseDown = false;
	let isDragging = false;
	let suppressNextClick = false;
	let lastClientX = 0;
	let lastClientY = 0;
	let lastMoveAt = 0;
	let totalMovementX = 0;
	let totalMovementY = 0;
	let velocityX = 0;
	let velocityY = 0;
	let momentumFrame = 0;

	const onMouseDown = (event: MouseEvent) => {
		suppressNextClick = false;
		if (event.buttons !== 1) return;

		cancelAnimationFrame(momentumFrame);
		isMouseDown = true;
		isDragging = false;
		lastClientX = event.clientX;
		lastClientY = event.clientY;
		lastMoveAt = performance.now();
		totalMovementX = 0;
		totalMovementY = 0;
		velocityX = 0;
		velocityY = 0;
	};

	const onMouseMove = (event: MouseEvent) => {
		if (!isMouseDown) return;

		event.preventDefault();

		grabbingCursorStyle ??= createGrabbingCursorStyle();

		const now = performance.now();
		const elapsedMs = Math.max(now - lastMoveAt, 1);
		const deltaX = lastClientX - event.clientX;
		const deltaY = lastClientY - event.clientY;
		lastClientX = event.clientX;
		lastClientY = event.clientY;
		lastMoveAt = now;
		totalMovementX += Math.abs(deltaX);
		totalMovementY += Math.abs(deltaY);

		element.scrollLeft += deltaX;
		element.scrollTop += deltaY;
		velocityX = deltaX / elapsedMs;
		velocityY = deltaY / elapsedMs;

		if (
			!isDragging &&
			(totalMovementX > DRAG_ACTIVATION_DISTANCE_PX ||
				totalMovementY > DRAG_ACTIVATION_DISTANCE_PX)
		) {
			isDragging = true;
		}
	};

	const onMouseUp = () => {
		if (!isMouseDown) return;

		isMouseDown = false;
		grabbingCursorStyle?.remove();
		grabbingCursorStyle = null;
		suppressNextClick = isDragging;

		const idledSinceLastMove =
			performance.now() - lastMoveAt > VELOCITY_IDLE_TIMEOUT_MS;
		if (isDragging && !idledSinceLastMove) {
			previousFrameAt = performance.now();
			momentumFrame = requestAnimationFrame(momentumScrollStep);
		}
		isDragging = false;
	};

	const onClick = (event: MouseEvent) => {
		if (!suppressNextClick) return;

		suppressNextClick = false;
		event.preventDefault();
		event.stopPropagation();
	};

	let previousFrameAt = 0;
	const momentumScrollStep = (now: number) => {
		const elapsedMs = Math.min(now - previousFrameAt, 3 * MOMENTUM_FRAME_MS);
		previousFrameAt = now;

		const decay = MOMENTUM_DECAY_PER_FRAME ** (elapsedMs / MOMENTUM_FRAME_MS);
		velocityX *= decay;
		velocityY *= decay;
		element.scrollLeft += velocityX * elapsedMs;
		element.scrollTop += velocityY * elapsedMs;

		if (
			Math.abs(velocityX) > MOMENTUM_MIN_SPEED_PX_PER_MS ||
			Math.abs(velocityY) > MOMENTUM_MIN_SPEED_PX_PER_MS
		) {
			momentumFrame = requestAnimationFrame(momentumScrollStep);
		}
	};

	element.addEventListener("mousedown", onMouseDown);
	element.addEventListener("click", onClick, { capture: true });
	window.addEventListener("mousemove", onMouseMove);
	window.addEventListener("mouseup", onMouseUp);

	return () => {
		element.removeEventListener("mousedown", onMouseDown);
		element.removeEventListener("click", onClick, { capture: true });
		window.removeEventListener("mousemove", onMouseMove);
		window.removeEventListener("mouseup", onMouseUp);
		cancelAnimationFrame(momentumFrame);
		grabbingCursorStyle?.remove();
	};
}

function createGrabbingCursorStyle() {
	const style = document.createElement("style");
	style.textContent = "* { cursor: grabbing !important; }";
	document.head.appendChild(style);
	return style;
}
