/**
 * The clip ring buffer's engine, off the main thread so a busy page never
 * costs it a frame: the capture's video track (a transferred
 * MediaStreamTrackProcessor stream) runs through a VideoEncoder (hardware
 * H.264 where available, a keyframe every `KEYFRAME_INTERVAL_S`) into a
 * ring of GOPs holding the last `seconds`; the audio track through an
 * AudioEncoder into the same ring. Every packet is stamped with the wall
 * clock its frame was captured at — noted as the frame enters the encoder,
 * claimed as the packet comes out, so encoder latency does not shift it;
 * video by frame timestamp, audio by sample position, because audio
 * timestamps cannot be trusted (a display capture's drift against its
 * sample count, and the AAC encoder counts samples anyway) — the clock the
 * sampler stamps detections with, so a cut asks for wall-clock seconds and
 * gets the GOP at or before its start through the packets up to its end,
 * muxed to MP4 with mediabunny — no decode, so a cut takes milliseconds.
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
import type {
	RingBufferClip,
	RingWorkerRequest,
	RingWorkerResponse,
} from "./ring-buffer-protocol";

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
/** footage that begins this long after the asked start misses the action itself, not just the approach */
const MAX_MISSING_LEAD_S = 5;
/** a slice whose loudest sample is under this (about -60 dBFS) carries no signal */
const SILENCE_PEAK = 0.001;
/** how often at most the main thread hears that sound is coming in */
const AUDIO_SIGNAL_REPORT_S = 1;
/**
 * Audio is laid out by sample count from its first packet; a packet whose
 * capture time is further ahead than this jumps forward (a delivery gap),
 * anything less is jitter smoothed away.
 */
const AUDIO_RESYNC_S = 0.1;

interface Stamped {
	packet: EncodedPacket;
	/** wall-clock seconds the frame/sample was captured at */
	wall: number;
}

interface Gop {
	packets: Stamped[];
	/** JPEG data URL of the keyframe, for the clip card */
	thumbnail?: string;
}

let ring: Ring | null = null;

self.onmessage = (e: MessageEvent<RingWorkerRequest>) => {
	const msg = e.data;
	if (msg.kind === "start") {
		ring = new Ring(msg.seconds);
		void ring.start(msg).then(
			() => post({ kind: "started" }),
			(error) => post({ kind: "error", message: describe(error) }),
		);
	} else if (msg.kind === "cut") {
		void (
			ring?.cut(msg.start, msg.end, msg.audioOffset) ?? Promise.resolve(null)
		).then(
			(clip) => post({ kind: "cut", id: msg.id, clip }),
			(error) =>
				post({ kind: "cutError", id: msg.id, message: describe(error) }),
		);
	}
};

function post(msg: RingWorkerResponse): void {
	self.postMessage(msg);
}

class Ring {
	readonly #seconds: number;
	readonly #gops: Gop[] = [];
	readonly #audio: Stamped[] = [];
	readonly #videoClock = new CaptureClock();
	readonly #audioClock = new SampleClock();
	#audioSampleRate = 48_000;
	#videoConfig: VideoDecoderConfig | undefined;
	#audioConfig: AudioDecoderConfig | undefined;
	#audioContainerCodec: AudioCodec | null = null;
	#videoEncoder: VideoEncoder | null = null;
	#audioEncoder: AudioEncoder | null = null;
	#lastKeyframeAt = Number.NEGATIVE_INFINITY;
	#audioSignalReportedAt = Number.NEGATIVE_INFINITY;

	constructor(seconds: number) {
		this.#seconds = seconds;
	}

	/** Starts encoding both streams; resolves once the video encoder is configured. */
	async start({
		video,
		audio,
		width,
		height,
		framerate,
	}: Extract<RingWorkerRequest, { kind: "start" }>): Promise<void> {
		const codec = await firstSupportedVideoCodec(width, height, framerate);
		if (!codec) throw new Error("no H.264 encoder available for clips");

		this.#videoEncoder = new VideoEncoder({
			output: (chunk, meta) => this.#onVideoChunk(chunk, meta),
			error: (error) => this.#fail(error),
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
		void this.#pumpVideo(video);
		if (audio && typeof AudioEncoder !== "undefined") {
			void this.#pumpAudio(audio);
		}
	}

	/**
	 * The footage between two wall-clock seconds as an MP4, from the keyframe
	 * at or before `start`, the sound moved `audioOffset` seconds later. Null
	 * when the ring holds nothing for the range.
	 */
	async cut(
		start: number,
		end: number,
		audioOffset: number,
	): Promise<RingBufferClip | null> {
		const gopIndex = this.#gops.findLastIndex(
			(gop) => gop.packets[0]!.wall <= start,
		);
		const gops = this.#gops.slice(Math.max(0, gopIndex));
		const firstGopAt = gops[0]?.packets[0]?.wall;
		if (firstGopAt === undefined || firstGopAt - start > MAX_MISSING_LEAD_S) {
			return null;
		}
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
			? this.#audio
					.map(({ packet, wall }) => ({ packet, wall: wall + audioOffset }))
					.filter(
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
				// each packet sits where its sound was captured against the clip's
				// first frame, packets running on from one another unless a gap says
				// otherwise
				let audioMeta: { decoderConfig?: AudioDecoderConfig } | undefined = {
					decoderConfig: this.#audioConfig,
				};
				let next: number | null = null;
				for (const { packet, wall } of audio) {
					const captured = wall - clipStart;
					const timestamp: number =
						next !== null && captured < next + AUDIO_RESYNC_S ? next : captured;
					next = timestamp + packet.duration;
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

	async #pumpVideo(stream: ReadableStream<VideoFrame>): Promise<void> {
		const reader = stream.getReader();
		for (;;) {
			const { value: frame, done } = await reader.read();
			if (done || !frame) break;
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
				void thumbnailOf(frame.clone()).then((thumbnail) => {
					const gop = this.#gops.at(-1);
					if (gop && !gop.thumbnail) gop.thumbnail = thumbnail;
				});
			}
			this.#videoClock.note(frame.timestamp, now);
			encoder.encode(frame, { keyFrame });
			frame.close();
		}
	}

	async #pumpAudio(stream: ReadableStream<AudioData>): Promise<void> {
		const reader = stream.getReader();
		let configured = false;
		for (;;) {
			const { value: data, done } = await reader.read();
			if (done || !data) break;
			const now = Date.now() / 1000;
			if (!configured) {
				configured = true;
				const choice = await firstSupportedAudioCodec(
					data.numberOfChannels,
					data.sampleRate,
				);
				if (!choice) {
					data.close();
					break;
				}
				this.#audioContainerCodec = choice.container;
				this.#audioSampleRate = data.sampleRate;
				this.#audioEncoder = new AudioEncoder({
					output: (chunk, meta) => this.#onAudioChunk(chunk, meta),
					error: (error) => {
						this.#audioEncoder = null;
						post({ kind: "audioError", message: describe(error) });
					},
				});
				this.#audioEncoder.configure({
					codec: choice.codec,
					numberOfChannels: data.numberOfChannels,
					sampleRate: data.sampleRate,
					bitrate: AUDIO_BITRATE,
				});
				this.#reportAudioSignal(now);
			}
			const encoder = this.#audioEncoder;
			if (encoder?.state === "configured" && encoder.encodeQueueSize < 32) {
				const peak = peakOf(data);
				if (peak === null || peak > SILENCE_PEAK) this.#reportAudioSignal(now);
				this.#audioClock.note(data.numberOfFrames, now);
				encoder.encode(data);
			}
			data.close();
		}
	}

	#reportAudioSignal(now: number): void {
		if (now - this.#audioSignalReportedAt < AUDIO_SIGNAL_REPORT_S) return;
		this.#audioSignalReportedAt = now;
		post({ kind: "audioSignal", at: now });
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
		const packet = EncodedPacket.fromEncodedChunk(chunk);
		this.#audio.push({
			packet,
			wall: this.#audioClock.claim(
				Math.round(packet.duration * this.#audioSampleRate),
				this.#audioSampleRate,
			),
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

	#fail(error: unknown): void {
		this.#videoEncoder = null;
		post({ kind: "error", message: describe(error) });
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
}

/**
 * Wall-clock stamps of the audio slices handed to the encoder, by sample
 * position: an output packet is stamped from the slice its first sample
 * came from, whatever any timestamp says. Slices the encoder has passed
 * are dropped as packets claim beyond them.
 */
class SampleClock {
	readonly #slices: { endSample: number; wall: number }[] = [];
	#samplesIn = 0;
	#samplesOut = 0;

	note(frames: number, wall: number): void {
		this.#samplesIn += frames;
		this.#slices.push({ endSample: this.#samplesIn, wall });
	}

	/** Wall-clock seconds the packet of `frames` samples begins at; now when nothing was noted. */
	claim(frames: number, sampleRate: number): number {
		const start = this.#samplesOut;
		this.#samplesOut += frames;
		while (this.#slices.length > 1 && this.#slices[0]!.endSample <= start) {
			this.#slices.shift();
		}
		const slice = this.#slices[0];
		if (!slice) return Date.now() / 1000;
		return slice.wall - Math.max(0, slice.endSample - start) / sampleRate;
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

/** A JPEG data URL of the frame, which is closed here. */
async function thumbnailOf(frame: VideoFrame): Promise<string> {
	try {
		const bitmap = await createImageBitmap(frame, {
			resizeWidth: THUMBNAIL_WIDTH,
			resizeHeight: THUMBNAIL_HEIGHT,
		});
		const canvas = new OffscreenCanvas(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
		canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
		bitmap.close();
		const blob = await canvas.convertToBlob({
			type: "image/jpeg",
			quality: 0.7,
		});
		return `data:image/jpeg;base64,${base64Of(new Uint8Array(await blob.arrayBuffer()))}`;
	} finally {
		frame.close();
	}
}

function base64Of(bytes: Uint8Array): string {
	let binary = "";
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(binary);
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

function describe(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
