/**
 * What the music removal workers (clip-music.worker.ts, vod-music.worker.ts)
 * share: the music set off the static assets CDN (its index and tracks,
 * decoded and resampled), decoding a file's sound to planar channels and
 * the audio encoder's delay.
 */
import {
	ALL_FORMATS,
	type AudioCodec,
	AudioSample,
	AudioSampleSink,
	AudioSampleSource,
	BlobSource,
	BufferTarget,
	Input,
	MkvOutputFormat,
	Output,
	Quality,
} from "mediabunny";
import { decodeMusicIndex, type MusicIndex } from "../core/music/fingerprint";
import { resample } from "../core/music/resample";

const MUSIC_PATH = "scanner/v1/bgm";

/** The music set's root URL under the static assets CDN root (`Config.staticAssetsUrl`). */
export function musicBaseUrl(assetsBaseUrl: string): string {
	return `${assetsBaseUrl}/${MUSIC_PATH}`;
}

export async function fetchMusicIndex(musicBase: string): Promise<MusicIndex> {
	const response = await fetchOk(`${musicBase}/index.bin`, {
		cache: "no-cache",
	});
	return decodeMusicIndex(await response.arrayBuffer());
}

/** Track `id` of the set, its channels at `sampleRate`. */
export async function loadMusicTrack(
	index: MusicIndex,
	id: string,
	musicBase: string,
	sampleRate: number,
): Promise<Float32Array[]> {
	const track = index.tracks.find((candidate) => candidate.id === id)!;
	const bytes = await (await fetchOk(`${musicBase}/${track.file}`)).blob();
	const decoded = await decodeAudio(bytes);
	if (!decoded) throw new Error(`can't decode the music track ${id}`);
	return decoded.channels.map((channel) =>
		resample(channel, decoded.sampleRate, sampleRate),
	);
}

interface DecodedAudio {
	channels: Float32Array[];
	sampleRate: number;
	/** the first sample's timestamp, seconds */
	start: number;
}

/** The file's whole sound; null when it has none this browser can decode. */
export async function decodeAudio(file: Blob): Promise<DecodedAudio | null> {
	const input = new Input({
		formats: ALL_FORMATS,
		source: new BlobSource(file),
	});
	try {
		const track = await input.getPrimaryAudioTrack();
		if (!track || !(await track.canDecode())) return null;
		const chunks: Float32Array[][] = [];
		let start: number | null = null;
		let sampleRate = track.sampleRate;
		for await (const sample of new AudioSampleSink(track).samples()) {
			start ??= sample.timestamp;
			sampleRate = sample.sampleRate;
			chunks.push(audioPlanes(sample));
			sample.close();
		}
		if (start === null || chunks.length === 0) return null;
		return { channels: concatenate(chunks), sampleRate, start };
	} finally {
		input.dispose();
	}
}

/**
 * How many samples late the encoder's output plays: an AAC encoder puts
 * silence of its own first (2112 samples on macOS) that mediabunny's muxers
 * don't signal, so every player hears it. Measured by encoding a click and
 * finding it in the decoded result; a new sound fed to this encoder starts
 * this many samples in to keep in sync.
 */
export async function audioEncoderDelay({
	codec,
	bitrate,
	numberOfChannels,
	sampleRate,
}: {
	codec: AudioCodec;
	bitrate: number;
	numberOfChannels: number;
	sampleRate: number;
}): Promise<number> {
	const clickAt = Math.round(sampleRate / 4);
	const clickLength = Math.round(sampleRate / 200);
	const click = Float32Array.from({ length: clickLength }, (_, i) => {
		const envelope = Math.sin((Math.PI * i) / clickLength) ** 2;
		return 0.5 * envelope * Math.sin((2 * Math.PI * 1000 * i) / sampleRate);
	});
	const length = sampleRate;
	const data = new Float32Array(length * numberOfChannels);
	for (let c = 0; c < numberOfChannels; c++)
		data.set(click, c * length + clickAt);

	const target = new BufferTarget();
	const output = new Output({ format: new MkvOutputFormat(), target });
	const source = new AudioSampleSource({
		codec,
		quality: new Quality({ bitrate }),
	});
	output.addAudioTrack(source);
	await output.start();
	const sample = new AudioSample({
		data,
		format: "f32-planar",
		numberOfChannels,
		sampleRate,
		timestamp: 0,
	});
	await source.add(sample);
	sample.close();
	source.close();
	await output.finalize();

	const decoded = await decodeAudio(new Blob([target.buffer!]));
	if (!decoded) return 0;
	const heard = decoded.channels[0]!;
	let best = 0;
	let bestScore = Number.NEGATIVE_INFINITY;
	for (let at = 0; at + clickLength <= heard.length; at++) {
		let score = 0;
		for (let i = 0; i < clickLength; i++) score += heard[at + i]! * click[i]!;
		if (score > bestScore) {
			bestScore = score;
			best = at;
		}
	}
	const delay = Math.round(decoded.start * sampleRate) + best - clickAt;
	return Math.max(0, delay);
}

/** The sample's channels as planar floats. */
export function audioPlanes(sample: AudioSample): Float32Array[] {
	return Array.from({ length: sample.numberOfChannels }, (_, planeIndex) => {
		const plane = new Float32Array(sample.numberOfFrames);
		sample.copyTo(plane, { planeIndex, format: "f32-planar" });
		return plane;
	});
}

function concatenate(chunks: Float32Array[][]): Float32Array[] {
	const channelCount = chunks[0]!.length;
	const length = chunks.reduce((sum, chunk) => sum + chunk[0]!.length, 0);
	return Array.from({ length: channelCount }, (_, c) => {
		const channel = new Float32Array(length);
		let at = 0;
		for (const chunk of chunks) {
			const plane = chunk[Math.min(c, chunk.length - 1)]!;
			channel.set(plane, at);
			at += plane.length;
		}
		return channel;
	});
}

async function fetchOk(url: string, init?: RequestInit): Promise<Response> {
	const response = await fetch(url, init);
	if (!response.ok) throw new Error(`fetch ${url}: ${response.status}`);
	return response;
}
