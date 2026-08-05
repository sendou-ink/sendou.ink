/**
 * Capture layer: OBS Virtual Camera in via getUserMedia, frames out as
 * ImageBitmaps at a low sample rate. The interface downstream is just
 * (bitmap, t) — a WHIP/MediaMTX transport can replace this file later.
 */

export async function openVirtualCamera(
	deviceId?: string,
): Promise<MediaStream> {
	return navigator.mediaDevices.getUserMedia({
		video: {
			deviceId: deviceId ? { exact: deviceId } : undefined,
			width: { ideal: 1920 },
			height: { ideal: 1080 },
		},
		audio: false,
	});
}

export async function listVideoInputs(): Promise<MediaDeviceInfo[]> {
	const devices = await navigator.mediaDevices.enumerateDevices();
	return devices.filter((d) => d.kind === "videoinput");
}

export type FrameHandler = (bitmap: ImageBitmap, t: number) => void;

/**
 * Sample frames from a playing video element at ~fps using
 * requestVideoFrameCallback. Returns a stop function.
 */
export function startSampler(
	video: HTMLVideoElement,
	fps: number,
	onFrame: FrameHandler,
): () => void {
	const intervalMs = 1000 / fps;
	let lastSample = Number.NEGATIVE_INFINITY;
	let lastMediaTime = Number.NEGATIVE_INFINITY;
	let stopped = false;
	let handle = 0;

	const tick = async (now: number, metadata: VideoFrameCallbackMetadata) => {
		if (stopped) return;
		// Throttle on the callback clock, not metadata.mediaTime: Firefox never
		// advances mediaTime for MediaStream-backed videos, which would freeze
		// sampling after the first frame.
		if (now - lastSample >= intervalMs) {
			lastSample = now;
			try {
				const bitmap = await createImageBitmap(video);
				if (stopped) {
					bitmap.close();
					return;
				}
				// Same Firefox quirk for the frame timestamp: fall back to the clock
				// when mediaTime isn't advancing so timestamps stay monotonic (the
				// timeline's merge windows compare them).
				const t =
					metadata.mediaTime > lastMediaTime ? metadata.mediaTime : now / 1000;
				lastMediaTime = Math.max(lastMediaTime, metadata.mediaTime);
				onFrame(bitmap, t);
			} catch {
				// video not ready / tab hidden — skip this frame
			}
		}
		if (!stopped) handle = video.requestVideoFrameCallback(tick);
	};
	handle = video.requestVideoFrameCallback(tick);

	return () => {
		stopped = true;
		video.cancelVideoFrameCallback(handle);
	};
}
