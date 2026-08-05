/**
 * One-shot frame handoff into the screenshot page: a page stashes the exact
 * analyzed frame here and switches to the screenshot tab, which picks it up
 * on mount.
 */
let pending: Blob | null = null;

export function setScreenshotFrame(frame: Blob): void {
	pending = frame;
}

export function takeScreenshotFrame(): Blob | null {
	const frame = pending;
	pending = null;
	return frame;
}
