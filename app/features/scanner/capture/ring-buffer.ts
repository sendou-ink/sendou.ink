/**
 * Live clip footage: the capture stream's video track runs through a
 * VideoEncoder (hardware H.264 where available, a keyframe every
 * `KEYFRAME_INTERVAL_S`) into a ring of GOPs holding the last `seconds`;
 * the audio track through an AudioEncoder into the same ring. Every packet
 * is stamped with the wall clock its frame was captured at (noted as the
 * frame enters the encoder, claimed as the packet comes out, so encoder
 * latency does not shift it), the clock the sampler stamps detections with,
 * so a cut asks for wall-clock seconds and gets the GOP at or before its
 * start through the packets up to its end, muxed to MP4 with mediabunny —
 * no decode, so a cut takes milliseconds.
 */
import {
	type AudioCodec,
	BufferTarget,
	EncodedAudioPacketSource,
	EncodedPacket,
	EncodedVideoPacketSource,
	Mp4OutputFormat,
	Output,
} from "mediabunny";

/** ~indistinguishable from the source at 720p60 per the auto-clipper measurements */
const VIDEO_BITRATE = 16_000_000;
const KEYFRAME_INTERVAL_S = 2;
const AUDIO_BITRATE = 160_000;
/** high profile at level 5.1 covers 1080p60; the fallbacks trade profile for reach */
const VIDEO_CODECS = ["avc1.640033", "avc1.4d0033", "avc1.42e033"];
/** AAC is the MP4-native choice; Chromium encodes it on most but not all platforms */
const AUDIO_CODECS: { codec: string; container: AudioCodec }[] = [
	{ codec: "mp4a.40.2", container: "aac" },
	{ codec: "opus", container: "opus" },
];
const THUMBNAIL_WIDTH = 320;
const THUMBNAIL_HEIGHT = 180;
/** 10 ms audio slices the processor queues while the main thread is busy; past it Chromium drops the oldest */
const AUDIO_BUFFER_FRAMES = 200;
/** a slice whose loudest sample is under this (about -60 dBFS) carries no signal */
const SILENCE_PEAK = 0.001;

interface Stamped {
	packet: EncodedPacket;
	/** wall-clock seconds the frame/sample arrived at */
	wall: number;
}

interface Gop {
	packets: Stamped[];
	/** JPEG data URL of the keyframe, for the clip card */
	thumbnail?: string;
}

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

export interface RingBufferClip {
	blob: Blob;
	/** wall-clock seconds the clip really starts at (the keyframe) */
	start: number;
	end: number;
	hasAudio: boolean;
	thumbnail?: string;
}

/** Whether this browser can keep a clip ring buffer at all. */
export function supportsRingBuffer(): boolean {
	return (
		TrackProcessor !== undefined &&
		typeof VideoEncoder !== "undefined" &&
		typeof VideoEncoder.isConfigSupported === "function"
	);
}

export class ClipRingBuffer {
	readonly #seconds: number;
	readonly #gops: Gop[] = [];
	readonly #audio: Stamped[] = [];
	#videoConfig: VideoDecoderConfig | undefined;
	#audioConfig: AudioDecoderConfig | undefined;
	#audioContainerCodec: AudioCodec | null = null;
	#videoEncoder: VideoEncoder | null = null;
	#audioEncoder: AudioEncoder | null = null;
	#readers: ReadableStreamDefaultReader<VideoFrame | AudioData>[] = [];
	readonly #videoClock = new CaptureClock();
	readonly #audioClock = new CaptureClock();
	#audioSignalAt: number | null = null;
	#stopped = false;
	#lastKeyframeAt = Number.NEGATIVE_INFINITY;

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

	/** Starts encoding both tracks; resolves once the video encoder is configured. */
	async start(stream: MediaStream): Promise<void> {
		const videoTrack = stream.getVideoTracks()[0];
		if (!videoTrack || !TrackProcessor) throw new Error("no video track");
		const settings = videoTrack.getSettings();
		const width = settings.width ?? 1920;
		const height = settings.height ?? 1080;
		const framerate = settings.frameRate ?? 60;
		const codec = await firstSupportedVideoCodec(width, height, framerate);
		if (!codec) throw new Error("no H.264 encoder available for clips");

		this.#videoEncoder = new VideoEncoder({
			output: (chunk, meta) => this.#onVideoChunk(chunk, meta),
			error: () => this.#fail(),
		});
		this.#videoEncoder.configure({
			codec,
			width,
			height,
			bitrate: VIDEO_BITRATE,
			framerate,
			latencyMode: "realtime",
			hardwareAcceleration: "prefer-hardware",
		});
		void this.#pumpVideo(videoTrack);

		const audioTrack = stream.getAudioTracks()[0];
		if (audioTrack && typeof AudioEncoder !== "undefined") {
			void this.#startAudio(audioTrack);
		}
	}

	/**
	 * The footage between two wall-clock seconds as an MP4, from the keyframe
	 * at or before `start`. Null when the ring holds nothing for the range.
	 */
	async cut(start: number, end: number): Promise<RingBufferClip | null> {
		const gopIndex = this.#gops.findLastIndex(
			(gop) => gop.packets[0]!.wall <= start,
		);
		const gops = this.#gops.slice(Math.max(0, gopIndex));
		const video = gops
			.flatMap((gop) => gop.packets)
			.filter((stamped) => stamped.wall <= end);
		const first = video[0];
		if (!first || !this.#videoConfig) return null;
		const clipStart = first.wall;
		const clipEnd = video.at(-1)!.wall;
		const thumbnail =
			gops.findLast((gop) => gop.thumbnail && gop.packets[0]!.wall <= end)
				?.thumbnail ?? gops[0]?.thumbnail;

		const format = new Mp4OutputFormat({ fastStart: "in-memory" });
		const target = new BufferTarget();
		const output = new Output({ format, target });
		const videoSource = new EncodedVideoPacketSource("avc");
		output.addVideoTrack(videoSource);
		const audio = this.#audioContainerCodec
			? this.#audio.filter(
					(stamped) => stamped.wall >= clipStart && stamped.wall <= clipEnd,
				)
			: [];
		const audioSource =
			audio.length > 0 && this.#audioContainerCodec
				? new EncodedAudioPacketSource(this.#audioContainerCodec)
				: null;
		if (audioSource) output.addAudioTrack(audioSource);
		await output.start();
		try {
			const base = first.packet.timestamp;
			let meta: { decoderConfig: VideoDecoderConfig } | undefined = {
				decoderConfig: this.#videoConfig,
			};
			for (const { packet } of video) {
				await videoSource.add(
					packet.clone({ timestamp: packet.timestamp - base }),
					meta,
				);
				meta = undefined;
			}
			videoSource.close();
			if (audioSource) {
				// audio timestamps live on the audio track's own clock: align the
				// first sample to where its arrival sits against the clip's first frame
				const firstAudio = audio[0]!;
				const audioBase =
					firstAudio.packet.timestamp - (firstAudio.wall - clipStart);
				let audioMeta: { decoderConfig?: AudioDecoderConfig } | undefined = {
					decoderConfig: this.#audioConfig,
				};
				for (const { packet } of audio) {
					const timestamp = packet.timestamp - audioBase;
					if (timestamp < 0) continue;
					await audioSource.add(packet.clone({ timestamp }), audioMeta);
					audioMeta = undefined;
				}
				audioSource.close();
			}
			await output.finalize();
		} catch (error) {
			await output.cancel();
			throw error;
		}
		return {
			blob: new Blob([target.buffer!], { type: format.mimeType }),
			start: clipStart,
			end: clipEnd,
			hasAudio: audioSource !== null,
			thumbnail,
		};
	}

	stop(): void {
		this.#stopped = true;
		for (const reader of this.#readers) void reader.cancel().catch(() => {});
		this.#readers = [];
		this.#videoEncoder?.close();
		this.#videoEncoder = null;
		this.#audioEncoder?.close();
		this.#audioEncoder = null;
		this.#gops.length = 0;
		this.#audio.length = 0;
		this.#videoClock.clear();
		this.#audioClock.clear();
		this.#audioSignalAt = null;
	}

	async #pumpVideo(track: MediaStreamTrack): Promise<void> {
		const reader = new TrackProcessor!({ track }).readable.getReader();
		this.#readers.push(reader);
		while (!this.#stopped) {
			const { value, done } = await reader.read();
			if (done || !value) break;
			const frame = value as VideoFrame;
			const encoder = this.#videoEncoder;
			if (encoder?.state !== "configured") {
				frame.close();
				continue;
			}
			// back-pressure: a stalled encoder drops frames rather than queueing memory
			if (encoder.encodeQueueSize > 4) {
				frame.close();
				continue;
			}
			const now = Date.now() / 1000;
			const keyFrame = now - this.#lastKeyframeAt >= KEYFRAME_INTERVAL_S;
			if (keyFrame) {
				this.#lastKeyframeAt = now;
				void this.#thumbnail(frame).then((thumbnail) => {
					const gop = this.#gops.at(-1);
					if (gop && !gop.thumbnail) gop.thumbnail = thumbnail;
				});
			}
			this.#videoClock.note(frame.timestamp, now);
			encoder.encode(frame, { keyFrame });
			frame.close();
		}
	}

	async #startAudio(track: MediaStreamTrack): Promise<void> {
		const reader = new TrackProcessor!({
			track,
			maxBufferSize: AUDIO_BUFFER_FRAMES,
		}).readable.getReader();
		this.#readers.push(reader);
		let configured = false;
		while (!this.#stopped) {
			const { value, done } = await reader.read();
			if (done || !value) break;
			const data = value as AudioData;
			const now = Date.now() / 1000;
			if (!configured) {
				configured = true;
				const choice = await firstSupportedAudioCodec(
					data.numberOfChannels,
					data.sampleRate,
				);
				if (!choice || this.#stopped) {
					data.close();
					break;
				}
				this.#audioContainerCodec = choice.container;
				this.#audioEncoder = new AudioEncoder({
					output: (chunk, meta) => this.#onAudioChunk(chunk, meta),
					error: () => {
						this.#audioEncoder = null;
					},
				});
				this.#audioEncoder.configure({
					codec: choice.codec,
					numberOfChannels: data.numberOfChannels,
					sampleRate: data.sampleRate,
					bitrate: AUDIO_BITRATE,
				});
				this.#audioSignalAt = now;
			}
			const encoder = this.#audioEncoder;
			if (encoder?.state === "configured" && encoder.encodeQueueSize < 32) {
				const peak = peakOf(data);
				if (peak === null || peak > SILENCE_PEAK) this.#audioSignalAt = now;
				this.#audioClock.note(data.timestamp, now);
				encoder.encode(data);
			}
			data.close();
		}
	}

	#onVideoChunk(
		chunk: EncodedVideoChunk,
		meta: EncodedVideoChunkMetadata | undefined,
	): void {
		if (meta?.decoderConfig) this.#videoConfig = meta.decoderConfig;
		const stamped = {
			packet: EncodedPacket.fromEncodedChunk(chunk),
			wall: this.#videoClock.claim(chunk.timestamp),
		};
		if (chunk.type === "key" || this.#gops.length === 0) {
			this.#gops.push({ packets: [stamped] });
			this.#evict(stamped.wall);
		} else {
			this.#gops.at(-1)!.packets.push(stamped);
		}
	}

	#onAudioChunk(
		chunk: EncodedAudioChunk,
		meta: EncodedAudioChunkMetadata | undefined,
	): void {
		if (meta?.decoderConfig) this.#audioConfig = meta.decoderConfig;
		this.#audio.push({
			packet: EncodedPacket.fromEncodedChunk(chunk),
			wall: this.#audioClock.claim(chunk.timestamp),
		});
	}

	/** Drops whole GOPs (and audio) older than the window, always keeping the newest two GOPs. */
	#evict(now: number): void {
		const horizon = now - this.#seconds;
		while (
			this.#gops.length > 2 &&
			this.#gops[1]!.packets[0]!.wall <= horizon
		) {
			this.#gops.shift();
		}
		const audioHorizon = this.#gops[0]?.packets[0]?.wall ?? horizon;
		while (this.#audio.length > 0 && this.#audio[0]!.wall < audioHorizon) {
			this.#audio.shift();
		}
	}

	async #thumbnail(frame: VideoFrame): Promise<string> {
		const bitmap = await createImageBitmap(frame, {
			resizeWidth: THUMBNAIL_WIDTH,
			resizeHeight: THUMBNAIL_HEIGHT,
		});
		const canvas = document.createElement("canvas");
		canvas.width = THUMBNAIL_WIDTH;
		canvas.height = THUMBNAIL_HEIGHT;
		canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
		bitmap.close();
		return canvas.toDataURL("image/jpeg", 0.7);
	}

	#fail(): void {
		this.#videoEncoder = null;
	}
}

/**
 * Wall-clock stamps of the frames handed to an encoder, claimed in order by
 * the packets that come out: a packet's stamp is its frame's capture time,
 * whatever the encoder's latency. Output timestamps trail the input ones
 * only where the encoder saw a gap, so a claim also sweeps up everything
 * older (frames the encoder dropped).
 */
class CaptureClock {
	readonly #entries: { timestamp: number; wall: number }[] = [];

	/** `timestamp` in microseconds, as WebCodecs frames carry it */
	note(timestamp: number, wall: number): void {
		this.#entries.push({ timestamp, wall });
	}

	/** Wall-clock seconds for the packet at `timestamp` (microseconds); now when nothing was noted for it. */
	claim(timestamp: number): number {
		let wall = Date.now() / 1000;
		let claimed = 0;
		for (const entry of this.#entries) {
			if (entry.timestamp > timestamp) break;
			wall = entry.wall + (timestamp - entry.timestamp) / 1e6;
			claimed++;
		}
		this.#entries.splice(0, claimed);
		return wall;
	}

	clear(): void {
		this.#entries.length = 0;
	}
}

/** The loudest sample of the slice's first channel; null when it cannot be read. */
function peakOf(data: AudioData): number | null {
	try {
		const samples = new Float32Array(data.numberOfFrames);
		data.copyTo(samples, { planeIndex: 0, format: "f32-planar" });
		let peak = 0;
		for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
		return peak;
	} catch {
		return null;
	}
}

async function firstSupportedVideoCodec(
	width: number,
	height: number,
	framerate: number,
): Promise<string | null> {
	for (const codec of VIDEO_CODECS) {
		try {
			const { supported } = await VideoEncoder.isConfigSupported({
				codec,
				width,
				height,
				bitrate: VIDEO_BITRATE,
				framerate,
				latencyMode: "realtime",
			});
			if (supported) return codec;
		} catch {
			// an unknown codec string throws rather than reporting unsupported
		}
	}
	return null;
}

async function firstSupportedAudioCodec(
	numberOfChannels: number,
	sampleRate: number,
): Promise<{ codec: string; container: AudioCodec } | null> {
	for (const choice of AUDIO_CODECS) {
		try {
			const { supported } = await AudioEncoder.isConfigSupported({
				codec: choice.codec,
				numberOfChannels,
				sampleRate,
				bitrate: AUDIO_BITRATE,
			});
			if (supported) return choice;
		} catch {
			// same as the video probe
		}
	}
	return null;
}
