const KEYBOARD_PAN_STEP_PX = 10;
const KEYBOARD_ZOOM_FACTOR = 1.1;
const WHEEL_ZOOM_SENSITIVITY = 0.002;
const TRACKPAD_PINCH_ZOOM_SENSITIVITY = 0.01;
const KEYBOARD_PAN: Record<string, { x: number; y: number }> = {
	ArrowLeft: { x: KEYBOARD_PAN_STEP_PX, y: 0 },
	ArrowRight: { x: -KEYBOARD_PAN_STEP_PX, y: 0 },
	ArrowUp: { x: 0, y: KEYBOARD_PAN_STEP_PX },
	ArrowDown: { x: 0, y: -KEYBOARD_PAN_STEP_PX },
};

interface CropGestureHandlers {
	/** Screen pixels the image was dragged by. */
	onPan: (delta: { x: number; y: number }) => void;
	/** Multiply the zoom by `factor`, keeping the point at `anchor` (client coordinates) in place; no anchor = the frame center. */
	onZoom: (factor: number, anchor?: { x: number; y: number }) => void;
}

/**
 * Wires drag (mouse, pen, one finger), pinch (two fingers), wheel and trackpad pinch, and arrow/+/- keys
 * on `element` to pan and zoom callbacks. Returns a function removing the listeners.
 */
export function attachCropGestures(
	element: HTMLElement,
	{ onPan, onZoom }: CropGestureHandlers,
) {
	const pointers = new Map<number, { x: number; y: number }>();

	const handlePointerDown = (event: PointerEvent) => {
		if (event.pointerType === "mouse" && event.button !== 0) return;

		element.setPointerCapture(event.pointerId);
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
	};

	const handlePointerMove = (event: PointerEvent) => {
		const previous = pointers.get(event.pointerId);
		if (!previous) return;

		const current = { x: event.clientX, y: event.clientY };

		if (pointers.size === 1) {
			pointers.set(event.pointerId, current);
			onPan({ x: current.x - previous.x, y: current.y - previous.y });
			return;
		}

		const [first, second] = [...pointers.values()];
		const before = pinchState(first, second);
		pointers.set(event.pointerId, current);
		const [nextFirst, nextSecond] = [...pointers.values()];
		const after = pinchState(nextFirst, nextSecond);

		onPan({
			x: after.midpoint.x - before.midpoint.x,
			y: after.midpoint.y - before.midpoint.y,
		});
		if (before.distance > 0) {
			onZoom(after.distance / before.distance, after.midpoint);
		}
	};

	const handlePointerEnd = (event: PointerEvent) => {
		pointers.delete(event.pointerId);
	};

	const handleWheel = (event: WheelEvent) => {
		event.preventDefault();

		const sensitivity = event.ctrlKey
			? TRACKPAD_PINCH_ZOOM_SENSITIVITY
			: WHEEL_ZOOM_SENSITIVITY;
		onZoom(Math.exp(-event.deltaY * sensitivity), {
			x: event.clientX,
			y: event.clientY,
		});
	};

	const handleKeyDown = (event: KeyboardEvent) => {
		const pan = KEYBOARD_PAN[event.key];
		if (pan) {
			event.preventDefault();
			onPan(pan);
			return;
		}

		if (event.key === "+" || event.key === "=") {
			event.preventDefault();
			onZoom(KEYBOARD_ZOOM_FACTOR);
		} else if (event.key === "-") {
			event.preventDefault();
			onZoom(1 / KEYBOARD_ZOOM_FACTOR);
		}
	};

	element.addEventListener("pointerdown", handlePointerDown);
	element.addEventListener("pointermove", handlePointerMove);
	element.addEventListener("pointerup", handlePointerEnd);
	element.addEventListener("pointercancel", handlePointerEnd);
	element.addEventListener("wheel", handleWheel, { passive: false });
	element.addEventListener("keydown", handleKeyDown);

	return () => {
		element.removeEventListener("pointerdown", handlePointerDown);
		element.removeEventListener("pointermove", handlePointerMove);
		element.removeEventListener("pointerup", handlePointerEnd);
		element.removeEventListener("pointercancel", handlePointerEnd);
		element.removeEventListener("wheel", handleWheel);
		element.removeEventListener("keydown", handleKeyDown);
	};
}

function pinchState(
	first: { x: number; y: number },
	second: { x: number; y: number },
) {
	return {
		distance: Math.hypot(second.x - first.x, second.y - first.y),
		midpoint: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
	};
}
