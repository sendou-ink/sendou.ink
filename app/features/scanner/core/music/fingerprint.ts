/**
 * Landmark audio fingerprints (the Shazam idea) for telling which battle
 * track plays in a clip, and where. Spectrogram peaks of mono 12 kHz audio
 * are paired into hashes of (anchor bin, bin delta, frame delta); a track's
 * hashes, keyed to the anchor's frame, form the index. A clip makes the same
 * hashes, and every index hit votes for a (track, reference frame − clip
 * frame) offset: music lines up on one offset, game sounds scatter.
 *
 * Peaks are local maxima of the log spectrogram after each frame's mean is
 * taken out (a gunshot raises every bin, not one), then the strongest few
 * per second. The index pairs each peak with its next few; a clip pairs
 * every peak with every other inside the same target zone and keeps more
 * peaks per second, so the index's pairs still turn up among game sounds.
 */
import { fft } from "./fft";
import { resample } from "./resample";

export const FINGERPRINT_SAMPLE_RATE = 12_000;
const FRAME_SIZE = 1024;
const FRAME_HOP = 256;
/** seconds per fingerprint frame */
export const FINGERPRINT_FRAME_SECONDS = FRAME_HOP / FINGERPRINT_SAMPLE_RATE;
const MIN_HZ = 150;
const MAX_HZ = 5000;
const PEAK_RADIUS_FRAMES = 8;
const PEAK_RADIUS_BINS = 10;
const INDEX_PEAKS_PER_SECOND = 10;
const INDEX_FAN_OUT = 3;
const CLIP_PEAKS_PER_SECOND = 30;
const MAX_PAIR_FRAMES = 63;
const MAX_PAIR_BINS = 63;
const INDEX_MAGIC = 0x4d474253; // "SBGM"
const INDEX_VERSION = 1;
const FRAME_BITS = 20;

export interface MusicTrack {
	id: string;
	title: string;
	/** the audio file's name next to the index */
	file: string;
}

export interface MusicIndex {
	tracks: MusicTrack[];
	/** ascending */
	hashes: Uint32Array;
	/** `track index << 20 | anchor frame`, parallel to `hashes` */
	values: Uint32Array;
}

export interface FingerprintMatch {
	track: number;
	/** the clip's anchor frame */
	clipFrame: number;
	/** reference frame − clip frame */
	offsetFrames: number;
}

interface Peak {
	frame: number;
	bin: number;
}

/** A track's hashes for the index, from its mono audio. */
export function trackHashes(
	mono: Float32Array,
	sampleRate: number,
): { hash: number; frame: number }[] {
	const peaks = spectrogramPeaks(
		resample(mono, sampleRate, FINGERPRINT_SAMPLE_RATE),
		INDEX_PEAKS_PER_SECOND,
	);
	const out: { hash: number; frame: number }[] = [];
	for (let i = 0; i < peaks.length; i++) {
		let paired = 0;
		for (let j = i + 1; j < peaks.length && paired < INDEX_FAN_OUT; j++) {
			const hash = pairHash(peaks[i]!, peaks[j]!);
			if (hash === null) {
				if (peaks[j]!.frame - peaks[i]!.frame > MAX_PAIR_FRAMES) break;
				continue;
			}
			out.push({ hash, frame: peaks[i]!.frame });
			paired++;
		}
	}
	return out;
}

/** Every index hit of the clip's hashes. */
export function matchClip(
	index: MusicIndex,
	mono: Float32Array,
	sampleRate: number,
): FingerprintMatch[] {
	const peaks = spectrogramPeaks(
		resample(mono, sampleRate, FINGERPRINT_SAMPLE_RATE),
		CLIP_PEAKS_PER_SECOND,
	);
	const matches: FingerprintMatch[] = [];
	for (let i = 0; i < peaks.length; i++) {
		for (let j = i + 1; j < peaks.length; j++) {
			if (peaks[j]!.frame - peaks[i]!.frame > MAX_PAIR_FRAMES) break;
			const hash = pairHash(peaks[i]!, peaks[j]!);
			if (hash === null) continue;
			for (
				let at = lowerBound(index.hashes, hash);
				index.hashes[at] === hash;
				at++
			) {
				const value = index.values[at]!;
				const frame = value & ((1 << FRAME_BITS) - 1);
				matches.push({
					track: value >>> FRAME_BITS,
					clipFrame: peaks[i]!.frame,
					offsetFrames: frame - peaks[i]!.frame,
				});
			}
		}
	}
	return matches;
}

/** The index as bytes: magic, version, a JSON header of the tracks, then the hash and value arrays. */
export function encodeMusicIndex(
	tracks: MusicTrack[],
	hashesPerTrack: { hash: number; frame: number }[][],
): Uint8Array {
	const entries = hashesPerTrack
		.flatMap((trackHashList, track) =>
			trackHashList.map(({ hash, frame }) => ({
				hash,
				value: ((track << FRAME_BITS) | frame) >>> 0,
			})),
		)
		.sort((a, b) => a.hash - b.hash || a.value - b.value);
	const header = new TextEncoder().encode(JSON.stringify({ tracks }));
	const headerPadded = Math.ceil(header.length / 4) * 4;
	const bytes = new Uint8Array(16 + headerPadded + entries.length * 8);
	const view = new DataView(bytes.buffer);
	view.setUint32(0, INDEX_MAGIC, true);
	view.setUint32(4, INDEX_VERSION, true);
	view.setUint32(8, header.length, true);
	view.setUint32(12, entries.length, true);
	bytes.set(header, 16);
	const hashes = new Uint32Array(entries.length);
	const values = new Uint32Array(entries.length);
	for (const [i, entry] of entries.entries()) {
		hashes[i] = entry.hash;
		values[i] = entry.value;
	}
	bytes.set(new Uint8Array(hashes.buffer), 16 + headerPadded);
	bytes.set(
		new Uint8Array(values.buffer),
		16 + headerPadded + entries.length * 4,
	);
	return bytes;
}

export function decodeMusicIndex(buffer: ArrayBuffer): MusicIndex {
	const view = new DataView(buffer);
	if (view.getUint32(0, true) !== INDEX_MAGIC) {
		throw new Error("not a music index");
	}
	if (view.getUint32(4, true) !== INDEX_VERSION) {
		throw new Error("unsupported music index version");
	}
	const headerLength = view.getUint32(8, true);
	const count = view.getUint32(12, true);
	const { tracks } = JSON.parse(
		new TextDecoder().decode(new Uint8Array(buffer, 16, headerLength)),
	) as { tracks: MusicTrack[] };
	const start = 16 + Math.ceil(headerLength / 4) * 4;
	return {
		tracks,
		hashes: new Uint32Array(buffer, start, count),
		values: new Uint32Array(buffer, start + count * 4, count),
	};
}

function pairHash(anchor: Peak, target: Peak): number | null {
	const frames = target.frame - anchor.frame;
	const bins = target.bin - anchor.bin;
	if (frames < 1 || frames > MAX_PAIR_FRAMES) return null;
	if (Math.abs(bins) > MAX_PAIR_BINS) return null;
	return ((anchor.bin << 13) | ((bins + 64) << 6) | frames) >>> 0;
}

function spectrogramPeaks(x: Float32Array, perSecond: number): Peak[] {
	const minBin = Math.round((MIN_HZ / FINGERPRINT_SAMPLE_RATE) * FRAME_SIZE);
	const maxBin = Math.round((MAX_HZ / FINGERPRINT_SAMPLE_RATE) * FRAME_SIZE);
	const bins = maxBin - minBin;
	const frames = Math.max(0, Math.floor((x.length - FRAME_SIZE) / FRAME_HOP));
	const window = hannWindow(FRAME_SIZE);
	const spectrogram = new Float32Array(frames * bins);
	const re = new Float64Array(FRAME_SIZE);
	const im = new Float64Array(FRAME_SIZE);
	for (let f = 0; f < frames; f++) {
		for (let i = 0; i < FRAME_SIZE; i++) {
			re[i] = x[f * FRAME_HOP + i]! * window[i]!;
			im[i] = 0;
		}
		fft(re, im);
		let mean = 0;
		for (let b = 0; b < bins; b++) {
			const k = b + minBin;
			const value = Math.log(re[k]! ** 2 + im[k]! ** 2 + 1e-10);
			spectrogram[f * bins + b] = value;
			mean += value;
		}
		mean /= bins;
		for (let b = 0; b < bins; b++) spectrogram[f * bins + b]! -= mean;
	}

	const neighborhoodMax = maxFilter(
		maxFilter(spectrogram, frames, bins, PEAK_RADIUS_FRAMES, "frames"),
		frames,
		bins,
		PEAK_RADIUS_BINS,
		"bins",
	);
	const framesPerSecond = Math.round(1 / FINGERPRINT_FRAME_SECONDS);
	const bySecond = new Map<number, (Peak & { value: number })[]>();
	for (let f = 0; f < frames; f++) {
		for (let b = 0; b < bins; b++) {
			const value = spectrogram[f * bins + b]!;
			if (value < neighborhoodMax[f * bins + b]!) continue;
			const second = Math.floor(f / framesPerSecond);
			let list = bySecond.get(second);
			if (!list) {
				list = [];
				bySecond.set(second, list);
			}
			list.push({ frame: f, bin: b, value });
		}
	}
	const peaks: Peak[] = [];
	for (const list of bySecond.values()) {
		list.sort((a, b) => b.value - a.value);
		for (const { frame, bin } of list.slice(0, perSecond)) {
			peaks.push({ frame, bin });
		}
	}
	return peaks.sort((a, b) => a.frame - b.frame || a.bin - b.bin);
}

/** Running max over ±`radius` along one axis of a frames × bins grid. */
function maxFilter(
	grid: Float32Array,
	frames: number,
	bins: number,
	radius: number,
	axis: "frames" | "bins",
): Float32Array {
	const out = new Float32Array(grid.length);
	for (let f = 0; f < frames; f++) {
		for (let b = 0; b < bins; b++) {
			let max = Number.NEGATIVE_INFINITY;
			if (axis === "frames") {
				const from = Math.max(0, f - radius);
				const to = Math.min(frames - 1, f + radius);
				for (let g = from; g <= to; g++)
					max = Math.max(max, grid[g * bins + b]!);
			} else {
				const from = Math.max(0, b - radius);
				const to = Math.min(bins - 1, b + radius);
				for (let c = from; c <= to; c++)
					max = Math.max(max, grid[f * bins + c]!);
			}
			out[f * bins + b] = max;
		}
	}
	return out;
}

function hannWindow(size: number): Float64Array {
	const window = new Float64Array(size);
	for (let i = 0; i < size; i++) {
		window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size);
	}
	return window;
}

function lowerBound(sorted: Uint32Array, value: number): number {
	let low = 0;
	let high = sorted.length;
	while (low < high) {
		const mid = (low + high) >>> 1;
		if (sorted[mid]! < value) low = mid + 1;
		else high = mid;
	}
	return low;
}
