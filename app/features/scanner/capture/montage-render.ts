/**
 * Renders the tournament montage into one MP4, in the browser: the title
 * card, the picked clips played back per their segments (each with its
 * ribbon; fast-forwarded stretches muted and badged), then the standings
 * card. Cards and ribbons come in as images (the page renders them, see
 * `MontageGraphics.tsx`). Every frame is decoded with mediabunny, drawn on a
 * canvas and re-encoded, unlike `vod-clips.ts`'s packet copy: speed changes
 * and overlays need new frames. Sound is laid out per section in an
 * `OfflineAudioContext` at the output rate, so each section's audio lasts
 * exactly as long as its frames and clips of different sample rates share
 * one track; each clip is then normalized to `TARGET_LOUDNESS_LUFS` with
 * its peaks limited. Given a music file, its sound (looped as needed, faded
 * in and out, normalized the same way) replaces the game sound throughout.
 */
import {
	ALL_FORMATS,
	AudioBufferSink,
	AudioBufferSource,
	BlobSource,
	BufferTarget,
	CanvasSource,
	getFirstEncodableAudioCodec,
	Input,
	Mp4OutputFormat,
	Output,
	Quality,
	StreamTarget,
	type StreamTargetChunk,
	VideoSampleSink,
} from "mediabunny";
import { integratedLoudness, limitPeaks } from "../core/loudness";
import { type PlaybackSegment, playbackDuration } from "../core/montage";
import {
	drawCard,
	drawFastForwardBadge,
	drawRibbon,
	MONTAGE_HEIGHT,
	MONTAGE_WIDTH,
} from "./montage-overlays";

const FPS = 60;
/** the live ring's rate: plenty for 1080p60 footage that gets edited further */
const VIDEO_BITRATE = 16_000_000;
const AUDIO_SAMPLE_RATE = 48_000;
const AUDIO_CHANNELS = 2;
const TITLE_CARD_SECONDS = 4;
const STANDINGS_CARD_SECONDS = 8;
/** a ramp at each cut so the sound doesn't click */
const AUDIO_EDGE_FADE_SECONDS = 0.02;
/** a streaming-platform level with headroom left for the edit */
const TARGET_LOUDNESS_LUFS = -16;
/** a near-silent clip isn't lifted into its noise floor */
const MAX_GAIN_DB = 24;
/** the limiter holds sample peaks under -1 dBFS */
const PEAK_CEILING = 10 ** (-1 / 20);
const MUSIC_FADE_IN_SECONDS = 1;
const MUSIC_FADE_OUT_SECONDS = 3;

export interface MontageClipSource {
	file: File;
	segments: PlaybackSegment[];
	/** drawn over the clip's first seconds */
	ribbon: ImageBitmap | null;
}

export interface MontageRenderProgress {
	/** output seconds rendered */
	done: number;
	total: number;
}

/**
 * Renders into `writable` (a file the user picked) or, without one, into
 * memory, returning the MP4. Throws when `signal` aborts.
 */
export async function renderMontage({
	title,
	clips,
	standings,
	music,
	writable,
	signal,
	onProgress,
}: {
	/** full frame */
	title: ImageBitmap;
	clips: MontageClipSource[];
	/** full frame */
	standings: ImageBitmap;
	/** its sound replaces the game sound */
	music: File | null;
	writable: WritableStream<StreamTargetChunk> | null;
	signal: AbortSignal;
	onProgress: (progress: MontageRenderProgress) => void;
}): Promise<Blob | null> {
	const canvas = new OffscreenCanvas(MONTAGE_WIDTH, MONTAGE_HEIGHT);
	const ctx = canvas.getContext("2d")!;
	const bufferTarget = writable ? null : new BufferTarget();
	const format = new Mp4OutputFormat(
		writable ? {} : { fastStart: "in-memory" },
	);
	const output = new Output({
		format,
		target: writable
			? new StreamTarget(writable, { chunked: true })
			: bufferTarget!,
	});
	const audioCodec = await getFirstEncodableAudioCodec(["aac", "opus"], {
		numberOfChannels: AUDIO_CHANNELS,
		sampleRate: AUDIO_SAMPLE_RATE,
	});
	if (!audioCodec) throw new Error("this browser can't encode audio");
	const videoSource = new CanvasSource(canvas, {
		codec: "avc",
		quality: new Quality({ bitrate: VIDEO_BITRATE }),
	});
	const audioSource = new AudioBufferSource({
		codec: audioCodec,
		quality: new Quality("high"),
	});
	output.addVideoTrack(videoSource, { frameRate: FPS });
	output.addAudioTrack(audioSource);

	const titleFrames = Math.round(TITLE_CARD_SECONDS * FPS);
	const standingsFrames = Math.round(STANDINGS_CARD_SECONDS * FPS);
	const totalFrames =
		titleFrames +
		standingsFrames +
		clips.reduce(
			(sum, clip) => sum + Math.round(playbackDuration(clip.segments) * FPS),
			0,
		);
	const total = totalFrames / FPS;
	const musicTrack = music ? await musicAudio(music, totalFrames) : null;
	/** the section starting at the current frame: its slice of the music, else silence */
	const backingAudio = (frameCount: number) =>
		musicTrack
			? audioSlice(musicTrack, framesDone, frameCount)
			: silence(frameCount);
	let framesDone = 0;
	const addFrame = async () => {
		signal.throwIfAborted();
		await videoSource.add(framesDone / FPS, 1 / FPS);
		framesDone++;
		if (framesDone % FPS === 0) onProgress({ done: framesDone / FPS, total });
	};

	await output.start();
	try {
		await renderCard(title, titleFrames);
		for (const clip of clips) {
			await renderClip(clip);
		}
		await renderCard(standings, standingsFrames);
		await output.finalize();
	} catch (error) {
		await output.cancel();
		throw error;
	}
	onProgress({ done: total, total });
	return bufferTarget?.buffer
		? new Blob([bufferTarget.buffer], { type: format.mimeType })
		: null;

	async function renderCard(
		card: ImageBitmap,
		frameCount: number,
	): Promise<void> {
		await audioSource.add(backingAudio(frameCount));
		for (let i = 0; i < frameCount; i++) {
			drawCard(ctx, card, { t: i / FPS, seconds: frameCount / FPS });
			await addFrame();
		}
	}

	async function renderClip(clip: MontageClipSource): Promise<void> {
		const input = new Input({
			formats: ALL_FORMATS,
			source: new BlobSource(clip.file),
		});
		try {
			const videoTrack = await input.getPrimaryVideoTrack();
			if (!videoTrack || !(await videoTrack.canDecode())) {
				throw new Error(`${clip.file.name}: the video can't be decoded`);
			}
			const audioTrack = await input.getPrimaryAudioTrack();
			const timeline = outputTimeline(clip.segments);
			const frameCount = Math.round(timeline.duration * FPS);

			await audioSource.add(
				musicTrack || !audioTrack || !(await audioTrack.canDecode())
					? backingAudio(frameCount)
					: await clipAudio(
							new AudioBufferSink(audioTrack),
							timeline,
							frameCount,
						),
			);

			// mid-frame, so float error never lands a boundary on the previous source frame
			const frames = Array.from({ length: frameCount }, (_, frame) =>
				timeline.at((frame + 0.5) / FPS),
			);
			const samples = new VideoSampleSink(videoTrack).samplesAtTimestamps(
				frames.map((frame) => frame.source),
			);
			let i = 0;
			for await (const sample of samples) {
				if (sample) {
					ctx.fillStyle = "#000";
					ctx.fillRect(0, 0, MONTAGE_WIDTH, MONTAGE_HEIGHT);
					sample.drawWithFit(ctx, { fit: "contain" });
					sample.close();
				}
				if (clip.ribbon) drawRibbon(ctx, clip.ribbon, i / FPS);
				const speed = frames[i]!.speed;
				if (speed !== 1) drawFastForwardBadge(ctx, speed);
				await addFrame();
				i++;
			}
		} finally {
			input.dispose();
		}
	}
}

/** Where each segment lands in the clip's output, and the source moment shown at an output time. */
function outputTimeline(segments: readonly PlaybackSegment[]) {
	let cursor = 0;
	const placed = segments.map((segment) => {
		const start = cursor;
		cursor += (segment.to - segment.from) / segment.speed;
		return { ...segment, start, end: cursor };
	});
	return {
		placed,
		duration: cursor,
		at(t: number) {
			const segment =
				placed.find((candidate) => t < candidate.end) ?? placed.at(-1)!;
			return {
				source: Math.min(
					segment.to,
					segment.from + (t - segment.start) * segment.speed,
				),
				speed: segment.speed,
			};
		},
	};
}

/** The clip's sound, normal-speed segments only (fast-forwarded ones stay silent), loudness-normalized. */
async function clipAudio(
	sink: AudioBufferSink,
	timeline: ReturnType<typeof outputTimeline>,
	frameCount: number,
): Promise<AudioBuffer> {
	const context = new OfflineAudioContext(
		AUDIO_CHANNELS,
		samplesFor(frameCount),
		AUDIO_SAMPLE_RATE,
	);
	for (const segment of timeline.placed) {
		if (segment.speed !== 1) continue;
		const buffer = await sourceAudio(sink, segment.from, segment.to);
		if (!buffer) continue;
		const gain = context.createGain();
		const edge = Math.min(
			AUDIO_EDGE_FADE_SECONDS,
			(segment.end - segment.start) / 2,
		);
		gain.gain.setValueAtTime(0, segment.start);
		gain.gain.linearRampToValueAtTime(1, segment.start + edge);
		gain.gain.setValueAtTime(1, segment.end - edge);
		gain.gain.linearRampToValueAtTime(0, segment.end);
		gain.connect(context.destination);
		const node = new AudioBufferSourceNode(context, { buffer });
		node.connect(gain);
		node.start(segment.start);
	}
	return normalized(await context.startRendering());
}

/** The buffer raised or lowered in place to `TARGET_LOUDNESS_LUFS`, its peaks limited under `PEAK_CEILING`. */
function normalized(buffer: AudioBuffer): AudioBuffer {
	const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
		buffer.getChannelData(i),
	);
	const loudness = integratedLoudness(channels, buffer.sampleRate);
	if (!Number.isFinite(loudness)) return buffer;
	const gain =
		10 ** (Math.min(MAX_GAIN_DB, TARGET_LOUDNESS_LUFS - loudness) / 20);
	for (const channel of channels) {
		for (let i = 0; i < channel.length; i++) channel[i] = channel[i]! * gain;
	}
	limitPeaks(channels, buffer.sampleRate, PEAK_CEILING);
	return buffer;
}

/** The source's sound from `from` to `to` as one buffer at its own rate; null when there is none. */
async function sourceAudio(
	sink: AudioBufferSink,
	from: number,
	to: number,
): Promise<AudioBuffer | null> {
	let target: AudioBuffer | null = null;
	for await (const { buffer, timestamp } of sink.buffers(from, to)) {
		target ??= new AudioBuffer({
			length: Math.ceil((to - from) * buffer.sampleRate),
			numberOfChannels: buffer.numberOfChannels,
			sampleRate: buffer.sampleRate,
		});
		const offset = Math.round((timestamp - from) * buffer.sampleRate);
		if (offset >= target.length) continue;
		for (let channel = 0; channel < target.numberOfChannels; channel++) {
			const data = buffer.getChannelData(
				Math.min(channel, buffer.numberOfChannels - 1),
			);
			target.copyToChannel(
				data.subarray(Math.max(0, -offset)),
				channel,
				Math.max(0, offset),
			);
		}
	}
	return target;
}

/** The music as one track the length of the video: looped as needed, faded in and out, normalized. */
async function musicAudio(
	file: File,
	frameCount: number,
): Promise<AudioBuffer> {
	const input = new Input({
		formats: ALL_FORMATS,
		source: new BlobSource(file),
	});
	try {
		const track = await input.getPrimaryAudioTrack();
		if (!track || !(await track.canDecode())) {
			throw new Error(`${file.name}: no sound that can be decoded`);
		}
		const buffer = await sourceAudio(
			new AudioBufferSink(track),
			0,
			await track.computeDuration(),
		);
		if (!buffer) throw new Error(`${file.name}: the sound is empty`);

		const length = samplesFor(frameCount);
		const context = new OfflineAudioContext(
			AUDIO_CHANNELS,
			length,
			AUDIO_SAMPLE_RATE,
		);
		const end = length / AUDIO_SAMPLE_RATE;
		const gain = context.createGain();
		gain.gain.setValueAtTime(0, 0);
		gain.gain.linearRampToValueAtTime(1, MUSIC_FADE_IN_SECONDS);
		gain.gain.setValueAtTime(1, Math.max(0, end - MUSIC_FADE_OUT_SECONDS));
		gain.gain.linearRampToValueAtTime(0, end);
		gain.connect(context.destination);
		const node = new AudioBufferSourceNode(context, { buffer, loop: true });
		node.connect(gain);
		node.start(0);
		return normalized(await context.startRendering());
	} finally {
		input.dispose();
	}
}

/** `frameCount` frames' worth of `track` from frame `fromFrame` on. */
function audioSlice(
	track: AudioBuffer,
	fromFrame: number,
	frameCount: number,
): AudioBuffer {
	const slice = silence(frameCount);
	const offset = samplesFor(fromFrame);
	for (let channel = 0; channel < AUDIO_CHANNELS; channel++) {
		slice.copyToChannel(
			track
				.getChannelData(Math.min(channel, track.numberOfChannels - 1))
				.subarray(offset, offset + slice.length),
			channel,
		);
	}
	return slice;
}

function silence(frameCount: number): AudioBuffer {
	return new AudioBuffer({
		length: samplesFor(frameCount),
		numberOfChannels: AUDIO_CHANNELS,
		sampleRate: AUDIO_SAMPLE_RATE,
	});
}

function samplesFor(frameCount: number): number {
	return Math.round((frameCount / FPS) * AUDIO_SAMPLE_RATE);
}
