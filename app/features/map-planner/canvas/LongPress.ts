// A finger held still on something, which opens its context menu on touch
// screens where there is no right click (iOS never fires `contextmenu`).
// Fed pointer events by whoever listens, a Konva node or a DOM element.

import type { Point } from "../core/PlanDocument";

const LONG_PRESS_MS = 500;
/** How far the finger may wander, in screen pixels, before it is a drag instead. */
const LONG_PRESS_MAX_DISTANCE = 10;

/** See {@link create}. */
export interface LongPress {
	/** Starts waiting on a touch pointer going down, other pointers are ignored. */
	pointerDown: (event: PointerEvent) => void;
	/** Gives up once the pointer went too far, fed pointer moves and drag moves alike. */
	pointerMove: (event: Pick<PointerEvent, "clientX" | "clientY">) => void;
	/** Gives up, e.g. on pointer up. */
	cancel: () => void;
	/** Whether the last press was a long press, so the click following it can be ignored. */
	didFire: () => boolean;
}

/** Calls `onLongPress` with where the finger went down once it was held there long enough. */
export function create(onLongPress: (clientPoint: Point) => void): LongPress {
	let timer: ReturnType<typeof setTimeout> | null = null;
	let start: Point | null = null;
	let fired = false;

	const cancel = () => {
		if (timer !== null) clearTimeout(timer);
		timer = null;
		start = null;
	};

	return {
		pointerDown: (event) => {
			cancel();
			fired = false;
			if (event.pointerType !== "touch") return;

			const point: Point = [event.clientX, event.clientY];
			start = point;
			timer = setTimeout(() => {
				timer = null;
				start = null;
				fired = true;
				onLongPress(point);
			}, LONG_PRESS_MS);
		},
		pointerMove: (event) => {
			if (
				start &&
				Math.hypot(event.clientX - start[0], event.clientY - start[1]) >
					LONG_PRESS_MAX_DISTANCE
			) {
				cancel();
			}
		},
		cancel,
		didFire: () => fired,
	};
}
