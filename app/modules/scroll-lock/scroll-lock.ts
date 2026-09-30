const RELEASE_DELAY_MS = 24;
const SCROLLBAR_WIDTH_PROPERTY = "--scrollbar-width";

let lockCount = 0;
let restoreStyles: (() => void) | null = null;
let releaseTimeoutId: number | null = null;

export function lockScroll() {
	cancelScheduledRelease();
	lockCount++;
	restoreStyles ??= applyLockStyles();

	let released = false;
	return () => {
		if (released) return;
		released = true;
		lockCount--;
		if (lockCount === 0) {
			scheduleRelease();
		}
	};
}

export function isScrollLocked() {
	return restoreStyles !== null;
}

function applyLockStyles() {
	const root = document.documentElement;
	const body = document.body;
	const previous = {
		overflow: body.style.overflow,
		paddingRight: body.style.paddingRight,
		scrollbarWidth: root.style.getPropertyValue(SCROLLBAR_WIDTH_PROPERTY),
	};
	const scrollbarWidth = window.innerWidth - root.clientWidth;

	body.style.overflow = "hidden";
	if (scrollbarWidth > 0) {
		// Replace scrollbar with padding instead of using scrollbar-gutter stable because of some Chromium quirk
		const bodyPadding = Number.parseFloat(getComputedStyle(body).paddingRight);
		body.style.paddingRight = `${bodyPadding + scrollbarWidth}px`;
		root.style.setProperty(SCROLLBAR_WIDTH_PROPERTY, `${scrollbarWidth}px`);
	}

	return () => {
		body.style.overflow = previous.overflow;
		body.style.paddingRight = previous.paddingRight;
		root.style.setProperty(SCROLLBAR_WIDTH_PROPERTY, previous.scrollbarWidth);
	};
}

function scheduleRelease() {
	cancelScheduledRelease();
	releaseTimeoutId = window.setTimeout(() => {
		releaseTimeoutId = null;
		if (lockCount > 0) return;
		restoreStyles?.();
		restoreStyles = null;
	}, RELEASE_DELAY_MS);
}

function cancelScheduledRelease() {
	if (releaseTimeoutId === null) return;
	window.clearTimeout(releaseTimeoutId);
	releaseTimeoutId = null;
}
