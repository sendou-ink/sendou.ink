const KEYBOARD_MIN_HEIGHT = 150;
const KEYBOARD_INPUT_SELECTOR = `:is(
	input:is(:not([type]), [type="text"], [type="search"], [type="email"], [type="url"], [type="tel"], [type="password"], [type="number"]),
	textarea,
	[contenteditable]:not([contenteditable="false"])
):not([readonly], [inputmode="none"])`;

export interface VisibleViewportRect {
	top: number;
	left: number;
	right: number;
	bottom: number;
	width: number;
	height: number;
}

export function visibleViewportRect(): VisibleViewportRect {
	const root = document.documentElement;
	const layoutWidth = root.clientWidth;
	const layoutHeight = root.clientHeight;
	const viewport = window.visualViewport;
	if (!viewport) {
		return {
			top: 0,
			left: 0,
			right: layoutWidth,
			bottom: layoutHeight,
			width: layoutWidth,
			height: layoutHeight,
		};
	}

	const top = viewport.offsetTop;
	const left = viewport.offsetLeft;
	const right = Math.min(layoutWidth, left + viewport.width);
	const bottom = Math.min(layoutHeight, top + viewport.height);

	return {
		top,
		left,
		right,
		bottom,
		width: right - left,
		height: bottom - top,
	};
}

// iOS 18 can report a viewport gap with no keyboard (e.g. a stale innerHeight), so the gap only counts while something that brings up the keyboard is focused
export function keyboardIsOpen() {
	const viewport = window.visualViewport;
	if (!viewport) return false;

	return (
		window.innerHeight - viewport.height * viewport.scale >
			KEYBOARD_MIN_HEIGHT &&
		document.activeElement?.matches(KEYBOARD_INPUT_SELECTOR) === true
	);
}
