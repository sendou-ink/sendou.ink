/**
 * Live clip footage: the main-thread side of the ring buffer. It turns the
 * capture's tracks into MediaStreamTrackProcessor streams and hands them to
 * ring-buffer.worker.ts, which encodes and keeps the last `seconds` and
 * cuts clips out of them; nothing here touches a frame, so the page being
 * busy (React, the sampler, a cut) never costs the footage a frame. The
 * processors queue a few frames for the moments the worker is behind.
 */
import type {
	RingBufferClip,
	RingWorkerRequest,
	RingWorkerResponse,
} from "./ring-buffer-protocol";

export type { RingBufferClip } from "./ring-buffer-protocol";

/** frames the video processor queues before Chromium drops the oldest */
const VIDEO_BUFFER_FRAMES = 4;
/** 10 ms audio slices likewise: a couple of seconds, audio is cheap to hold */
const AUDIO_BUFFER_FRAMES = 200;

interface TrackProcessor<T> {
	readable: ReadableStream<T>;
}

/** The track processor is not in TypeScript's DOM lib; it exists in Chromium. */
const TrackProcessor = (
	globalThis as unknown as {
		MediaStreamTrackProcessor?: new (init: {
			track: MediaStreamTrack;
			maxBufferSize?: number;
		}) => TrackProcessor<VideoFrame | AudioData>;
	}
).MediaStreamTrackProcessor;

/** Whether this browser can keep a clip ring buffer at all. */
export function supportsRingBuffer(): boolean {
	return (
		TrackProcessor !== undefined &&
		typeof Worker !== "undefined" &&
		typeof VideoEncoder !== "undefined" &&
		typeof VideoEncoder.isConfigSupported === "function"
	);
}

export class ClipRingBuffer {
	readonly #seconds: number;
	#worker: Worker | null = null;
	#audioSignalAt: number | null = null;
	#audioFailure: string | null = null;
	#failure: string | null = null;
	#nextCutId = 0;
	readonly #cuts = new Map<
		number,
		{
			resolve: (clip: RingBufferClip | null) => void;
			reject: (error: Error) => void;
		}
	>();

	constructor(seconds: number) {
		this.#seconds = seconds;
	}

	/**
	 * Wall-clock seconds the audio encoder last got a slice with sound in it;
	 * null while no audio is being encoded. Stuck in the past = the input is
	 * open but silent.
	 */
	get audioSignalAt(): number | null {
		return this.#audioSignalAt;
	}

	/** Why the audio encoder gave up, once it has; clips from then on are silent. */
	get audioFailure(): string | null {
		return this.#audioFailure;
	}

	/** Starts encoding both tracks; resolves once the worker's video encoder is configured. */
	async start(stream: MediaStream): Promise<void> {
		const videoTrack = stream.getVideoTracks()[0];
		if (!videoTrack || !TrackProcessor) throw new Error("no video track");
		const settings = videoTrack.getSettings();
		const video = new TrackProcessor({
			track: videoTrack,
			maxBufferSize: VIDEO_BUFFER_FRAMES,
		}).readable as ReadableStream<VideoFrame>;
		const audioTrack = stream.getAudioTracks()[0];
		const audio = audioTrack
			? (new TrackProcessor({
					track: audioTrack,
					maxBufferSize: AUDIO_BUFFER_FRAMES,
				}).readable as ReadableStream<AudioData>)
			: null;

		const worker = new Worker(
			new URL("./ring-buffer.worker.ts", import.meta.url),
			{ type: "module" },
		);
		this.#worker = worker;
		const started = new Promise<void>((resolve, reject) => {
			worker.onmessage = (e: MessageEvent<RingWorkerResponse>) => {
				const msg = e.data;
				if (msg.kind === "started") resolve();
				else if (msg.kind === "error") {
					reject(new Error(msg.message));
					this.#failure = msg.message;
					for (const cut of this.#cuts.values()) {
						cut.reject(new Error(msg.message));
					}
					this.#cuts.clear();
				} else if (msg.kind === "cut") {
					this.#cuts.get(msg.id)?.resolve(msg.clip);
					this.#cuts.delete(msg.id);
				} else if (msg.kind === "cutError") {
					this.#cuts.get(msg.id)?.reject(new Error(msg.message));
					this.#cuts.delete(msg.id);
				} else if (msg.kind === "audioSignal") {
					this.#audioSignalAt = msg.at;
				} else if (msg.kind === "audioError") {
					this.#audioFailure = msg.message;
				}
			};
			worker.onerror = (event) => {
				reject(new Error(event.message || "clip worker failed"));
			};
		});
		this.#send(
			{
				kind: "start",
				video,
				audio,
				width: settings.width ?? 1920,
				height: settings.height ?? 1080,
				framerate: settings.frameRate ?? 60,
				seconds: this.#seconds,
			},
			audio ? [video, audio] : [video],
		);
		await started;
	}

	/**
	 * The footage between two wall-clock seconds as an MP4, from the keyframe
	 * at or before `start`, the sound moved `audioOffset` seconds later
	 * (negative: earlier). Null when the ring holds nothing for the range.
	 */
	cut(
		start: number,
		end: number,
		audioOffset = 0,
	): Promise<RingBufferClip | null> {
		if (this.#failure) return Promise.reject(new Error(this.#failure));
		if (!this.#worker) return Promise.resolve(null);
		const id = this.#nextCutId++;
		return new Promise((resolve, reject) => {
			this.#cuts.set(id, { resolve, reject });
			this.#send({ kind: "cut", id, start, end, audioOffset });
		});
	}

	/** Ends the worker; the tracks' processors close with the tracks. */
	stop(): void {
		this.#worker?.terminate();
		this.#worker = null;
		for (const cut of this.#cuts.values()) cut.resolve(null);
		this.#cuts.clear();
		this.#audioSignalAt = null;
	}

	#send(msg: RingWorkerRequest, transfer: Transferable[] = []): void {
		this.#worker?.postMessage(msg, transfer);
	}
}
