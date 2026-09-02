/**
 * VoD scan entry points. The primary path probes whether WebCodecs (via
 * mediabunny) can decode the file — then the analyzer workers each decode
 * their own time slice and no frames cross the main thread. Otherwise the
 * fallback seek-steps a <video> element (anything the browser can play, at
 * per-seek latency); its stride is supplied per step so it can widen over calm footage.
 */
import { ALL_FORMATS, BlobSource, Input } from "mediabunny";

interface VodFrame {
	/** the consumer owns the frame and must close() it */
	frame: ImageBitmap;
	/** seconds into the video */
	t: number;
}

/** Whether mediabunny + WebCodecs can decode `file`, and its duration if so. */
export async function probeWebCodecs(
	file: File,
): Promise<{ duration: number } | null> {
	const input = new Input({
		formats: ALL_FORMATS,
		source: new BlobSource(file),
	});
	try {
		const track = await input.getPrimaryVideoTrack();
		if (track && (await track.canDecode())) {
			return { duration: await input.computeDuration([track]) };
		}
		return null;
	} catch {
		return null;
	} finally {
		input.dispose();
	}
}

/**
 * Opens a seek-stepping scan over `video` (file already loaded; metadata is
 * awaited here). `nextStrideS` is consulted after every yielded frame.
 */
export async function openSeekScan(
	video: HTMLVideoElement,
	nextStrideS: () => number,
): Promise<{ duration: number; frames: AsyncGenerator<VodFrame> }> {
	await loadMetadata(video);
	if (!Number.isFinite(video.duration)) {
		throw new Error("video has no known duration — cannot scan by seeking");
	}
	return { duration: video.duration, frames: seekFrames(video, nextStrideS) };
}

async function* seekFrames(
	video: HTMLVideoElement,
	nextStrideS: () => number,
): AsyncGenerator<VodFrame> {
	for (let t = 0; t < video.duration; ) {
		await seekTo(video, t);
		yield { frame: await createImageBitmap(video), t };
		t += Math.max(0.01, nextStrideS());
	}
}

function loadMetadata(video: HTMLVideoElement): Promise<void> {
	return new Promise((resolve, reject) => {
		if (video.readyState >= HTMLMediaElement.HAVE_METADATA) return resolve();
		video.addEventListener("loadedmetadata", () => resolve(), { once: true });
		video.addEventListener(
			"error",
			() =>
				reject(
					new Error(video.error?.message || "cannot decode this file as video"),
				),
			{ once: true },
		);
	});
}

function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
	return new Promise((resolve) => {
		if (
			video.currentTime === t &&
			video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
		) {
			return resolve();
		}
		video.addEventListener("seeked", () => resolve(), { once: true });
		video.currentTime = t;
	});
}
