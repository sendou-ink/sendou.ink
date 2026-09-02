/**
 * Capture layer: OBS Virtual Camera in via getUserMedia, frames out as
 * ImageBitmaps at a low sample rate. Downstream sees only (bitmap, t).
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
 * Samples frames from a playing video element at ~fps. The clock is a
 * setInterval in a dedicated worker (ticker.worker.ts): rAF and
 * requestVideoFrameCallback pause in hidden tabs, but worker timers keep
 * firing, so capture continues in another tab. Timestamps come from
 * performance.now() (monotonic, which the merge windows rely on) rather than
 * mediaTime, which Firefox never advances for MediaStream-backed videos.
 * Returns a stop function.
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
