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

// xxx: hidden tabs can still be frozen/discarded outright, which suspends the
// workers too. A silent looping <audio> marks the page as playing audio and
// exempts it from both intensive throttling and freezing — measure whether we
// need it before adding it.

/**
 * Sample frames from a playing video element at ~fps. The clock is a
 * setInterval in a dedicated worker (ticker.worker.ts): rAF and
 * requestVideoFrameCallback pause entirely in hidden tabs, but worker timers
 * keep firing and the camera stream keeps decoding, so capture continues
 * while the user is in another tab or window. Timestamps come from
 * performance.now() (monotonic, which the timeline's merge windows rely on)
 * rather than mediaTime, which Firefox never advances for MediaStream-backed
 * videos anyway. Returns a stop function.
 */
export function startSampler(
	video: HTMLVideoElement,
	fps: number,
	onFrame: FrameHandler,
): () => void {
	const ticker = new Worker(new URL("./ticker.worker.ts", import.meta.url), {
		type: "module",
	});
	ticker.postMessage(1000 / fps);
	let stopped = false;
	let sampling = false;

	ticker.onmessage = async () => {
		if (stopped || sampling) return;
		sampling = true;
		try {
			const bitmap = await createImageBitmap(video);
			if (stopped) {
				bitmap.close();
				return;
			}
			onFrame(bitmap, performance.now() / 1000);
		} catch {
			// video not ready — skip this frame
		} finally {
			sampling = false;
		}
	};

	return () => {
		stopped = true;
		ticker.terminate();
	};
}
