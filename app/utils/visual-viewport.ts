const KEYBOARD_MIN_HEIGHT = 150;

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

export function keyboardIsOpen() {
	const viewport = window.visualViewport;
	if (!viewport) return false;

	return window.innerHeight - viewport.height > KEYBOARD_MIN_HEIGHT;
}
