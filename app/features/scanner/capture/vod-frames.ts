/**
 * VoD frame extraction: step through a video file yielding (frame, t) as
 * fast as decoding allows — no real-time playback. The primary path demuxes
 * the file and decodes **every frame** sequentially with WebCodecs (via
 * mediabunny), yielding the VideoFrames themselves (transferable to the
 * analyzer workers with no main-thread conversion); when the container/codec
 * can't be read that way, it falls back to seek-stepping a <video> element
 * at a small fixed step, which handles anything the browser can play at the
 * cost of per-seek latency and frame-exact coverage.
 */
import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from "mediabunny";

/**
 * Seek fallback step: a <video> element can't enumerate frames, so seek in
 * increments small enough that anything but blink-and-miss overlays is caught.
 */
const SEEK_STEP_SECONDS = 0.25;

interface VodFrame {
	/** the consumer owns the frame and must close() it */
	frame: ImageBitmap | VideoFrame;
	/** seconds into the video */
	t: number;
}

export interface VodScan {
	method: "webcodecs" | "seek";
	duration: number;
	frames: AsyncGenerator<VodFrame>;
	dispose(): void;
}

/**
 * Open a scan over `file`, yielding every decoded frame (or, on the seek
 * fallback, one frame every SEEK_STEP_SECONDS). `video` must already have
 * the file loaded (metadata not required yet); it is only driven by the
 * seek fallback.
 */
export async function openVodScan(
	file: File,
	video: HTMLVideoElement,
): Promise<VodScan> {
	const input = new Input({
		formats: ALL_FORMATS,
		source: new BlobSource(file),
	});
	try {
		const track = await input.getPrimaryVideoTrack();
		if (track && (await track.canDecode())) {
			const duration = await input.computeDuration([track]);
			return {
				method: "webcodecs",
				duration,
				frames: webCodecsFrames(input, new VideoSampleSink(track)),
				dispose: () => input.dispose(),
			};
		}
		input.dispose();
	} catch {
		input.dispose();
	}

	await loadMetadata(video);
	if (!Number.isFinite(video.duration)) {
		throw new Error("video has no known duration — cannot scan by seeking");
	}
	return {
		method: "seek",
		duration: video.duration,
		frames: seekFrames(video),
		dispose: () => {},
	};
}

async function* webCodecsFrames(
	input: Input,
	sink: VideoSampleSink,
): AsyncGenerator<VodFrame> {
	try {
		for await (const sample of sink.samples()) {
			if (!sample) continue;
			const t = sample.timestamp;
			const frame = sample.toVideoFrame();
			sample.close();
			yield { frame, t };
		}
	} finally {
		input.dispose();
	}
}

async function* seekFrames(video: HTMLVideoElement): AsyncGenerator<VodFrame> {
	for (let t = 0; t < video.duration; t += SEEK_STEP_SECONDS) {
		await seekTo(video, t);
		yield { frame: await createImageBitmap(video), t };
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
