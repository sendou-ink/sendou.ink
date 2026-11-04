/**
 * Takes the battle music out of a clip's sound by subtracting the known
 * track from it, leaving the game's other sounds. Steps:
 *
 * 1. Which music: the clip's fingerprint hits (fingerprint.ts) pile onto
 *    (track, offset) copies. A song repeats itself (verses, loops), so a
 *    few near copies come up besides the exact one.
 * 2. Exact alignment: each copy, by phase-transform cross-correlation at
 *    12 kHz over windows of the clip; the slope between windows gives the
 *    drift between the capture's and the console's clocks.
 * 3. Where: per second, the copy that explains most of the clip (per-bin
 *    least squares) — exact alignment makes this far more sensitive than
 *    fingerprint votes, which thin out under game sounds and voices, and
 *    it tells the exact copy from the near ones. Gaps with the same track
 *    on both sides are bridged (the music ducks while splatted). Each run
 *    is a segment, aligned once more on its own.
 * 4. The track, resampled onto the clip's timeline, is subtracted in the
 *    short-time Fourier domain through a per-bin complex gain fitted to the
 *    clip (least squares, smoothed over time and neighboring bins) — the
 *    game's music volume, ducking and filtering are not known up front.
 *    A Wiener post-filter then lowers what the subtraction misses.
 */
import * as R from "remeda";
import { fft, nextPowerOfTwo } from "./fft";
import {
	FINGERPRINT_FRAME_SECONDS,
	FINGERPRINT_SAMPLE_RATE,
	type MusicIndex,
	matchClip,
} from "./fingerprint";
import { resample, sincReader } from "./resample";

const MIN_CANDIDATE_VOTES = 8;
/** a copy the fingerprint votes for this much less than the best one is not tried */
const MIN_CANDIDATE_SHARE = 0.15;
const MAX_CANDIDATES = 6;
/** a segment this close to the clip's start or end is stretched to it */
const MAX_EDGE_GAP_SECONDS = 3;
const ALIGN_WINDOW_SECONDS = 10;
const ALIGN_HOP_SECONDS = 5;
const ALIGN_FRAME_SIZE = 4096;
const MIN_ALIGN_FRAMES = 8;
/** the fingerprint's offset is good to a frame or two plus the MP3 decoder delay */
const ALIGN_SEARCH_SECONDS = 0.06;
const ALIGN_MIN_HZ = 100;
const MIN_ALIGN_PEAK_Z = 5;
/** how far apart the fingerprint can place one copy of the music: a frame and a bit */
const COPY_TOLERANCE_SECONDS = 0.03;
const MAX_DRIFT = 300e-6;
const COVERAGE_FRAME_SIZE = 1024;
const COVERAGE_MAX_HZ = 4000;
/** each second is judged over this much of the clip either side */
const COVERAGE_RADIUS_SECONDS = 1;
/** a copy explains a second when it explains this many times what chance would */
const COVERAGE_MIN_CHANCE_MULTIPLE = 4;
/** the running copy is kept while it explains nearly as much as the best one */
const KEEP_COPY_SHARE = 0.95;
const SEGMENT_CROSSFADE_SECONDS = 0.05;
const STFT_SECONDS = 0.0427;
const GAIN_SMOOTHING_SECONDS = 0.4;
const GAIN_SMOOTHING_BINS = 2;
/** how much of the estimated music the post-filter assumes is left after subtraction */
const RESIDUAL_MUSIC_SHARE = 1;
const MIN_POST_FILTER_GAIN = 0.05;
/** -80 dBFS: a recording without sound, where the fingerprint still finds spurious matches */
const SILENT_RMS = 1e-4;
/** the shared FFT leaks rounding noise this far below a silent reference */
const SILENT_REFERENCE_POWER = 1e-18;

interface ClipAudio {
	channels: Float32Array[];
	sampleRate: number;
}

interface MusicRemoval {
	channels: Float32Array[];
	/** the index's track ids that were taken out */
	trackIds: string[];
	/** seconds of the clip that had music taken out */
	seconds: number;
}

interface MusicSegment {
	track: number;
	/** clip seconds */
	start: number;
	end: number;
	/** reference seconds − clip seconds, from the fingerprint */
	offset: number;
}

export interface AlignedSegment extends MusicSegment {
	/** reference seconds = `offset` + (1 + `drift`) × clip seconds */
	drift: number;
}

/**
 * The clip's sound with the indexed music it contains taken out; null when
 * no indexed music is found. `loadTrack` gives a track's channels at the
 * clip's sample rate.
 */
export async function removeMusic(
	audio: ClipAudio,
	{
		index,
		loadTrack,
	}: {
		index: MusicIndex;
		loadTrack: (id: string) => Promise<Float32Array[]>;
	},
): Promise<MusicRemoval | null> {
	const { channels, sampleRate } = audio;
	const length = channels[0]?.length ?? 0;
	if (length === 0) return null;
	const tracks = new Map<number, Float32Array[]>();
	const segments = await findMusic(mixDown(channels), sampleRate, {
		index,
		loadLowTrack: async (track) => {
			const trackChannels = await loadTrack(index.tracks[track]!.id);
			tracks.set(track, trackChannels);
			return resample(
				mixDown(trackChannels),
				sampleRate,
				FINGERPRINT_SAMPLE_RATE,
			);
		},
	});
	if (segments.length === 0) return null;
	const out = channels.map((channel, c) => {
		const reference = renderReference(segments, {
			trackChannel: (track) => {
				const trackChannels = tracks.get(track)!;
				return trackChannels[Math.min(c, trackChannels.length - 1)]!;
			},
			from: 0,
			length,
			sampleRate,
		});
		return subtractReference(channel, reference, sampleRate);
	});

	return {
		channels: out,
		trackIds: R.unique(segments.map((segment) => segment.track)).map(
			(track) => index.tracks[track]!.id,
		),
		seconds: segments.reduce(
			(sum, segment) => sum + segment.end - segment.start,
			0,
		),
	};
}

/**
 * Where in `mono` the indexed music plays and exactly which part of which
 * track, steps 1–3 of the module comment; empty when none is found.
 * `loadLowTrack` gives a track (index into `index.tracks`) mixed to mono at
 * `FINGERPRINT_SAMPLE_RATE`.
 */
export async function findMusic(
	mono: Float32Array,
	sampleRate: number,
	{
		index,
		loadLowTrack,
	}: {
		index: MusicIndex;
		loadLowTrack: (track: number) => Promise<Float32Array>;
	},
): Promise<AlignedSegment[]> {
	if (rootMeanSquare(mono) < SILENT_RMS) return [];
	const duration = mono.length / sampleRate;
	const candidates = fingerprintCandidates(matchClip(index, mono, sampleRate));
	if (candidates.length === 0) return [];

	const lowTracks = new Map<number, Float32Array>();
	for (const track of new Set(candidates.map((copy) => copy.track))) {
		lowTracks.set(track, await loadLowTrack(track));
	}
	const clipLow = resample(mono, sampleRate, FINGERPRINT_SAMPLE_RATE);
	const lowTrack = (track: number) => lowTracks.get(track)!;

	// every candidate copy aligned over the whole clip, then each second goes
	// to the copy that explains it best: near copies (a verse and its repeat)
	// share most fingerprints but only the exact one cancels cleanly
	const copies = alignSegments(
		candidates.map((copy) => ({ ...copy, start: 0, end: duration })),
		clipLow,
		lowTrack,
	);
	const segments = coverByCoherence(copies, clipLow, lowTrack, duration);
	if (segments.length === 0) return [];
	return alignSegments(segments, clipLow, lowTrack);
}

/**
 * The (track, offset) copies of the music the fingerprint hits line up on:
 * offsets the hits pile onto (± a frame), strongest first, the weak ones
 * against the best left out.
 */
function fingerprintCandidates(
	matches: ReturnType<typeof matchClip>,
): { track: number; offset: number }[] {
	const key = (track: number, offset: number) =>
		track * 2 ** 21 + offset + 2 ** 20;
	const counts = new Map<number, number>();
	for (const match of matches) {
		const k = key(match.track, match.offsetFrames);
		counts.set(k, (counts.get(k) ?? 0) + 1);
	}
	const merged = (k: number) =>
		(counts.get(k - 1) ?? 0) + (counts.get(k) ?? 0) + (counts.get(k + 1) ?? 0);
	// votes all on one offset tie its neighbors' merged score: its own count breaks the tie
	const rank = (k: number) =>
		merged(k) + (counts.get(k) ?? 0) / (matches.length + 1);
	const peaks = [...counts.keys()]
		.filter((k) => {
			const score = rank(k);
			return (
				merged(k) >= MIN_CANDIDATE_VOTES &&
				score > rank(k - 1) &&
				score >= rank(k + 1) &&
				score > rank(k - 2) &&
				score >= rank(k + 2)
			);
		})
		.sort((a, b) => merged(b) - merged(a));
	const best = peaks[0] ? merged(peaks[0]) : 0;
	return peaks
		.filter((k) => merged(k) >= MIN_CANDIDATE_SHARE * best)
		.slice(0, MAX_CANDIDATES)
		.map((k) => {
			const track = Math.floor(k / 2 ** 21);
			return {
				track,
				offset: (k - track * 2 ** 21 - 2 ** 20) * FINGERPRINT_FRAME_SECONDS,
			};
		});
}

function bridgeGaps(chosen: number[], trackOf: (candidate: number) => number) {
	let s = 0;
	while (s < chosen.length) {
		if (chosen[s] !== -1) {
			s++;
			continue;
		}
		let end = s;
		while (end < chosen.length && chosen[end] === -1) end++;
		const before = s > 0 ? chosen[s - 1]! : -1;
		const after = end < chosen.length ? chosen[end]! : -1;
		const gap = end - s;
		if (before !== -1 && after !== -1 && trackOf(before) === trackOf(after)) {
			// the same track on both sides kept playing through, if quieter
			const middle = s + Math.ceil(gap / 2);
			chosen.fill(before, s, middle);
			chosen.fill(after, middle, end);
		} else if (s === 0 && after !== -1 && gap <= MAX_EDGE_GAP_SECONDS) {
			chosen.fill(after, s, end);
		} else if (
			end === chosen.length &&
			before !== -1 &&
			gap <= MAX_EDGE_GAP_SECONDS
		) {
			chosen.fill(before, s, end);
		}
		s = end;
	}
}

function alignSegments(
	segments: MusicSegment[],
	clipLow: Float32Array,
	lowTrack: (track: number) => Float32Array,
): AlignedSegment[] {
	const measured = segments.map((segment) => {
		const measure = (start: number, seconds: number) =>
			measureOffset(
				clipLow,
				lowTrack(segment.track),
				start,
				seconds,
				segment.offset,
			);
		const windows: Peak[] = [];
		for (
			let start = segment.start;
			start + ALIGN_WINDOW_SECONDS <= segment.end + 1e-9;
			start += ALIGN_HOP_SECONDS
		) {
			const peak = measure(start, ALIGN_WINDOW_SECONDS);
			if (peak) windows.push(peak);
		}
		return {
			windows,
			whole: measure(segment.start, segment.end - segment.start),
		};
	});

	const slopes = measured.flatMap(({ windows }) =>
		windows.flatMap((a, i) =>
			windows
				.slice(i + 1)
				.filter((b) => b.t - a.t >= ALIGN_HOP_SECONDS)
				.map((b) => (b.offset - a.offset) / (b.t - a.t)),
		),
	);
	const drift = Math.max(
		-MAX_DRIFT,
		Math.min(MAX_DRIFT, slopes.length > 0 ? median(slopes) : 0),
	);

	const offsets = measured.map(({ windows, whole }) => {
		const peaks = windows.length > 0 ? windows : whole ? [whole] : [];
		return peaks.length > 0
			? median(peaks.map((peak) => peak.offset - drift * peak.t))
			: null;
	});
	const middle = (segment: MusicSegment) => (segment.start + segment.end) / 2;
	// the fingerprints were taken off another MP3 decoder, whose delay differs
	const decoderBias = median(
		segments.flatMap((segment, i) => {
			const offset = offsets[i];
			return offset === null || offset === undefined
				? []
				: [offset + drift * middle(segment) - segment.offset];
		}),
	);
	return segments.map((segment, i) => ({
		...segment,
		offset:
			offsets[i] ??
			offsetFromCopies(segment, segments, offsets) ??
			segment.offset + decoderBias - drift * middle(segment),
		drift,
	}));
}

/**
 * A segment the music was too quiet to measure in takes its offset from a
 * measured one of the same track: the same copy outright, or another copy
 * of the in-game loop, whose length the measured copies give away (their
 * offsets differ by whole loops). The fingerprint's coarse offsets must
 * agree with that to within a frame or so.
 */
function offsetFromCopies(
	segment: MusicSegment,
	segments: MusicSegment[],
	offsets: (number | null)[],
): number | null {
	const measured = segments
		.map((other, i) => ({ coarse: other.offset, exact: offsets[i] }))
		.filter(
			(other, i): other is { coarse: number; exact: number } =>
				segments[i]!.track === segment.track && other.exact !== null,
		);
	const loops = measured.flatMap((a, i) =>
		measured.slice(i + 1).flatMap((b) => {
			const difference = Math.abs(a.exact - b.exact);
			return difference > COPY_TOLERANCE_SECONDS
				? [1, 2, 3, 4].map((k) => difference / k)
				: [];
		}),
	);
	for (const other of measured) {
		const difference = segment.offset - other.coarse;
		if (Math.abs(difference) < COPY_TOLERANCE_SECONDS) return other.exact;
		for (const loop of loops) {
			const k = Math.round(difference / loop);
			if (k !== 0 && Math.abs(difference - k * loop) < COPY_TOLERANCE_SECONDS) {
				return other.exact + k * loop;
			}
		}
	}
	return null;
}

interface Peak {
	/** clip seconds the offset holds at */
	t: number;
	offset: number;
}

/**
 * The exact offset near `coarse` over a stretch of the clip, or null when
 * the music does not stand out there: the cross-spectrum of the clip and
 * the track (at `coarse`) averaged over overlapping frames, phase-transform
 * weighted, back to a correlation over lags.
 */
function measureOffset(
	clip: Float32Array,
	track: Float32Array,
	start: number,
	seconds: number,
	coarse: number,
): Peak | null {
	const rate = FINGERPRINT_SAMPLE_RATE;
	const size = ALIGN_FRAME_SIZE;
	const hop = size / 2;
	const window = hannWindow(size);
	const crossRe = new Float64Array(size);
	const crossIm = new Float64Array(size);
	const tr = new Float64Array(size);
	const ti = new Float64Array(size);
	const cr = new Float64Array(size);
	const ci = new Float64Array(size);
	const trackShift = coarse * rate;
	const shift = Math.round(trackShift) - trackShift;
	let frames = 0;
	const first = Math.round(start * rate);
	const last =
		Math.min(clip.length, Math.round((start + seconds) * rate)) - size;
	for (let at = first; at <= last; at += hop) {
		const trackAt = at + Math.round(trackShift);
		if (trackAt < 0 || trackAt + size > track.length) continue;
		for (let i = 0; i < size; i++) {
			tr[i] = track[trackAt + i]! * window[i]!;
			cr[i] = clip[at + i]! * window[i]!;
			ti[i] = 0;
			ci[i] = 0;
		}
		fft(tr, ti);
		fft(cr, ci);
		for (let k = 0; k < size; k++) {
			crossRe[k]! += tr[k]! * cr[k]! + ti[k]! * ci[k]!;
			crossIm[k]! += ti[k]! * cr[k]! - tr[k]! * ci[k]!;
		}
		frames++;
	}
	if (frames < MIN_ALIGN_FRAMES) return null;
	const lowBin = Math.ceil((ALIGN_MIN_HZ / rate) * size);
	for (let k = 0; k < size; k++) {
		const magnitude = Math.hypot(crossRe[k]!, crossIm[k]!) + 1e-20;
		const keep = Math.min(k, size - k) >= lowBin ? 1 / magnitude : 0;
		crossRe[k]! *= keep;
		crossIm[k]! *= keep;
	}
	fft(crossRe, crossIm, true);

	const search = Math.round(ALIGN_SEARCH_SECONDS * rate);
	const at = (lag: number) => crossRe[(lag + size) % size]!;
	let best = -search;
	let sum = 0;
	let sumSquares = 0;
	for (let lag = -search; lag <= search; lag++) {
		sum += at(lag);
		sumSquares += at(lag) ** 2;
		if (at(lag) > at(best)) best = lag;
	}
	const count = 2 * search + 1;
	const mean = sum / count;
	const deviation = Math.sqrt(
		Math.max(1e-20, sumSquares / count - mean * mean),
	);
	if ((at(best) - mean) / deviation < MIN_ALIGN_PEAK_Z) return null;
	if (best === -search || best === search) return null;
	const left = at(best - 1);
	const center = at(best);
	const right = at(best + 1);
	const curvature = left - 2 * center + right;
	const fraction = curvature < 0 ? (0.5 * (left - right)) / curvature : 0;
	return {
		t: start + seconds / 2,
		offset: coarse + shift / rate + (best + fraction) / rate,
	};
}

/**
 * Where in the clip each aligned copy of the music plays: per second, the
 * share of the clip's energy each copy explains (per-bin least squares over
 * a few seconds around it, the 100 Hz–4 kHz band) and the best one taken.
 * Seconds no copy explains above chance are left out, gaps with the same
 * track on both sides bridged.
 */
function coverByCoherence(
	copies: AlignedSegment[],
	clipLow: Float32Array,
	lowTrack: (track: number) => Float32Array,
	duration: number,
): MusicSegment[] {
	const rate = FINGERPRINT_SAMPLE_RATE;
	const size = COVERAGE_FRAME_SIZE;
	const hop = size / 2;
	const lowBin = Math.ceil((ALIGN_MIN_HZ / rate) * size);
	const highBin = Math.floor((COVERAGE_MAX_HZ / rate) * size);
	const bins = highBin - lowBin;
	const window = hannWindow(size);
	const frames = Math.max(0, Math.floor((clipLow.length - size) / hop) + 1);
	const spectra = (signal: (n: number) => number) => {
		const re = new Float32Array(frames * bins);
		const im = new Float32Array(frames * bins);
		const fr = new Float64Array(size);
		const fi = new Float64Array(size);
		for (let f = 0; f < frames; f++) {
			for (let i = 0; i < size; i++) {
				fr[i] = signal(f * hop + i) * window[i]!;
				fi[i] = 0;
			}
			fft(fr, fi);
			for (let b = 0; b < bins; b++) {
				re[f * bins + b] = fr[b + lowBin]!;
				im[f * bins + b] = fi[b + lowBin]!;
			}
		}
		return { re, im };
	};

	const clip = spectra((n) => clipLow[n]!);
	const seconds = Math.max(1, Math.ceil(duration));
	const framesOf = (s: number) => {
		const from = Math.max(
			0,
			Math.ceil(((s - COVERAGE_RADIUS_SECONDS) * rate) / hop),
		);
		const to = Math.min(
			frames,
			Math.floor(((s + 1 + COVERAGE_RADIUS_SECONDS) * rate - size) / hop) + 1,
		);
		return { from, to };
	};
	const shares = copies.map((copy) => {
		const read = sincReader(lowTrack(copy.track));
		const reference = spectra((n) => {
			const t = n / rate;
			return read((copy.offset + (1 + copy.drift) * t) * rate);
		});
		return Array.from({ length: seconds }, (_, s) => {
			const { from, to } = framesOf(s);
			let explained = 0;
			let total = 0;
			for (let b = 0; b < bins; b++) {
				let crossRe = 0;
				let crossIm = 0;
				let power = 0;
				for (let f = from; f < to; f++) {
					const at = f * bins + b;
					const yr = clip.re[at]!;
					const yi = clip.im[at]!;
					const rr = reference.re[at]!;
					const ri = reference.im[at]!;
					crossRe += yr * rr + yi * ri;
					crossIm += yi * rr - yr * ri;
					power += rr * rr + ri * ri;
					total += yr * yr + yi * yi;
				}
				if (power > 0) explained += (crossRe ** 2 + crossIm ** 2) / power;
			}
			// chance alone explains about one frame's worth
			const chance = 1 / Math.max(1, to - from);
			return total > 0 &&
				explained / total >= COVERAGE_MIN_CHANCE_MULTIPLE * chance
				? explained / total
				: 0;
		});
	});

	const chosen: number[] = [];
	for (let s = 0; s < seconds; s++) {
		let best = -1;
		for (let c = 0; c < copies.length; c++) {
			if (
				shares[c]![s]! > 0 &&
				(best === -1 || shares[c]![s]! > shares[best]![s]!)
			) {
				best = c;
			}
		}
		const previous = chosen.at(-1) ?? -1;
		chosen.push(
			best !== -1 &&
				previous !== -1 &&
				shares[previous]![s]! >= KEEP_COPY_SHARE * shares[best]![s]!
				? previous
				: best,
		);
	}
	bridgeGaps(chosen, (copy) => copies[copy]!.track);

	const segments: MusicSegment[] = [];
	for (let s = 0; s < seconds; s++) {
		const copy = chosen[s]!;
		if (copy === -1) continue;
		const last = segments.at(-1);
		if (last && last.end === s && chosen[s - 1] === copy) {
			last.end = s + 1;
		} else {
			segments.push({
				track: copies[copy]!.track,
				start: s,
				end: s + 1,
				offset: copies[copy]!.offset,
			});
		}
	}
	const last = segments.at(-1);
	if (last) last.end = Math.min(last.end, duration);
	// the offset alignment searches around holds at the segment's middle
	return segments.map((segment) => {
		const copy = copies[chosen[Math.floor(segment.start)]!]!;
		return {
			...segment,
			offset: copy.offset + copy.drift * ((segment.start + segment.end) / 2),
		};
	});
}

/**
 * The music `segments` say plays, rendered from one channel of the tracks
 * for `length` samples from sample `from` (`segments` sorted, seconds from
 * sample 0); segments that meet crossfade.
 */
export function renderReference(
	segments: AlignedSegment[],
	{
		trackChannel,
		from,
		length,
		sampleRate,
	}: {
		trackChannel: (track: number) => Float32Array;
		from: number;
		length: number;
		sampleRate: number;
	},
): Float32Array {
	const out = new Float32Array(length);
	const fade = SEGMENT_CROSSFADE_SECONDS * sampleRate;
	for (const [i, segment] of segments.entries()) {
		const joinsPrevious = segments[i - 1]?.end === segment.start;
		const joinsNext = segments[i + 1]?.start === segment.end;
		const start = segment.start * sampleRate;
		const end = segment.end * sampleRate;
		const first = Math.max(
			from,
			Math.floor(joinsPrevious ? start - fade / 2 : start),
		);
		const last = Math.min(
			from + length,
			Math.ceil(joinsNext ? end + fade / 2 : end),
		);
		if (first >= last) continue;
		const read = sincReader(trackChannel(segment.track));
		for (let n = first; n < last; n++) {
			const fadeIn = joinsPrevious ? ramp((n - (start - fade / 2)) / fade) : 1;
			const fadeOut = joinsNext ? ramp((end + fade / 2 - n) / fade) : 1;
			const t = n / sampleRate;
			out[n - from]! +=
				Math.min(fadeIn, fadeOut) *
				read((segment.offset + (1 + segment.drift) * t) * sampleRate);
		}
	}
	return out;
}

/**
 * `signal` minus `reference` (step 4 of the module comment): the reference
 * through a per-bin gain fitted to the signal, then a Wiener post-filter.
 * Where the reference is silent the signal comes back as it was.
 */
export function subtractReference(
	signal: Float32Array,
	reference: Float32Array,
	sampleRate: number,
): Float32Array {
	const size = stftSize(sampleRate);
	const hop = size / 4;
	const bins = size / 2 + 1;
	const window = new Float64Array(size);
	for (let i = 0; i < size; i++)
		window[i] = Math.sin((Math.PI * (i + 0.5)) / size);
	const frames = Math.ceil(signal.length / hop) + 3;
	const frameStart = (f: number) => f * hop - (size - hop);

	// the signal and the reference share one FFT, as its real and imaginary parts
	const zr = new Float64Array(size);
	const zi = new Float64Array(size);
	const yr = new Float64Array(bins);
	const yi = new Float64Array(bins);
	const rr = new Float64Array(bins);
	const ri = new Float64Array(bins);
	const analyze = (f: number) => {
		const start = frameStart(f);
		for (let i = 0; i < size; i++) {
			const n = start + i;
			const inside = n >= 0 && n < signal.length;
			zr[i] = inside ? signal[n]! * window[i]! : 0;
			zi[i] = inside ? reference[n]! * window[i]! : 0;
		}
		fft(zr, zi);
		for (let k = 0; k < bins; k++) {
			const j = (size - k) & (size - 1);
			yr[k] = 0.5 * (zr[k]! + zr[j]!);
			yi[k] = 0.5 * (zi[k]! - zi[j]!);
			rr[k] = 0.5 * (zi[k]! + zi[j]!);
			ri[k] = 0.5 * (zr[j]! - zr[k]!);
		}
	};

	// cross- and auto-spectra per frame, then smoothed into the gain's statistics
	const crossRe = new Float32Array(frames * bins);
	const crossIm = new Float32Array(frames * bins);
	const referencePower = new Float32Array(frames * bins);
	for (let f = 0; f < frames; f++) {
		analyze(f);
		for (let k = 0; k < bins; k++) {
			crossRe[f * bins + k] = yr[k]! * rr[k]! + yi[k]! * ri[k]!;
			crossIm[f * bins + k] = yi[k]! * rr[k]! - yr[k]! * ri[k]!;
			referencePower[f * bins + k] = rr[k]! ** 2 + ri[k]! ** 2;
		}
	}
	const decay = Math.exp(-hop / sampleRate / GAIN_SMOOTHING_SECONDS);
	for (const stats of [crossRe, crossIm, referencePower]) {
		smoothOverTime(stats, frames, bins, decay);
		smoothOverBins(stats, frames, bins, GAIN_SMOOTHING_BINS);
	}

	const cleaned = (f: number, er: Float64Array, ei: Float64Array) => {
		if (f >= frames) {
			er.fill(0);
			ei.fill(0);
			return;
		}
		analyze(f);
		for (let k = 0; k < bins; k++) {
			const at = f * bins + k;
			const power = referencePower[at]!;
			if (power <= SILENT_REFERENCE_POWER) {
				er[k] = yr[k]!;
				ei[k] = yi[k]!;
				continue;
			}
			const hr = crossRe[at]! / power;
			const hi = crossIm[at]! / power;
			const mr = hr * rr[k]! - hi * ri[k]!;
			const mi = hr * ri[k]! + hi * rr[k]!;
			const dr = yr[k]! - mr;
			const di = yi[k]! - mi;
			const residual = dr * dr + di * di;
			const music = RESIDUAL_MUSIC_SHARE * (mr * mr + mi * mi);
			const gain = Math.max(
				MIN_POST_FILTER_GAIN,
				residual / (residual + music + 1e-20),
			);
			er[k] = dr * gain;
			ei[k] = di * gain;
		}
	};

	// two frames per inverse FFT: both are real, one comes back as the real part, one as the imaginary
	const out = new Float64Array(signal.length);
	const norm = new Float64Array(signal.length);
	const ar = new Float64Array(bins);
	const ai = new Float64Array(bins);
	const br = new Float64Array(bins);
	const bi = new Float64Array(bins);
	const overlapAdd = (f: number, frame: Float64Array) => {
		const start = frameStart(f);
		for (let i = 0; i < size; i++) {
			const n = start + i;
			if (n < 0 || n >= signal.length) continue;
			out[n]! += frame[i]! * window[i]!;
			norm[n]! += window[i]! ** 2;
		}
	};
	for (let f = 0; f < frames; f += 2) {
		cleaned(f, ar, ai);
		cleaned(f + 1, br, bi);
		for (let k = 0; k < bins; k++) {
			zr[k] = ar[k]! - bi[k]!;
			zi[k] = ai[k]! + br[k]!;
			if (k > 0 && k < size / 2) {
				zr[size - k] = ar[k]! + bi[k]!;
				zi[size - k] = br[k]! - ai[k]!;
			}
		}
		fft(zr, zi, true);
		overlapAdd(f, zr);
		if (f + 1 < frames) overlapAdd(f + 1, zi);
	}
	return Float32Array.from(out, (value, n) =>
		norm[n]! > 1e-9 ? value / norm[n]! : 0,
	);
}

/**
 * The subtraction's frame length in samples; its hop is a quarter of it. A
 * signal cut at multiples of the hop, with a few seconds of margin, is
 * subtracted as if whole.
 */
export function stftSize(sampleRate: number): number {
	return nextPowerOfTwo(Math.round(STFT_SECONDS * sampleRate));
}

/** Forward then backward one-pole smoothing along frames, so the result does not lag. */
function smoothOverTime(
	stats: Float32Array,
	frames: number,
	bins: number,
	decay: number,
) {
	for (let f = 1; f < frames; f++) {
		for (let k = 0; k < bins; k++) {
			const at = f * bins + k;
			stats[at] = decay * stats[at - bins]! + (1 - decay) * stats[at]!;
		}
	}
	for (let f = frames - 2; f >= 0; f--) {
		for (let k = 0; k < bins; k++) {
			const at = f * bins + k;
			stats[at] = decay * stats[at + bins]! + (1 - decay) * stats[at]!;
		}
	}
}

function smoothOverBins(
	stats: Float32Array,
	frames: number,
	bins: number,
	radius: number,
) {
	const row = new Float64Array(bins);
	for (let f = 0; f < frames; f++) {
		for (let k = 0; k < bins; k++) row[k] = stats[f * bins + k]!;
		for (let k = 0; k < bins; k++) {
			let sum = 0;
			for (
				let j = Math.max(0, k - radius);
				j <= Math.min(bins - 1, k + radius);
				j++
			) {
				sum += row[j]!;
			}
			stats[f * bins + k] = sum;
		}
	}
}

/** The channels averaged into one. */
export function mixDown(channels: Float32Array[]): Float32Array {
	if (channels.length === 1) return channels[0]!;
	const mono = new Float32Array(channels[0]!.length);
	for (const channel of channels) {
		for (let i = 0; i < mono.length; i++)
			mono[i]! += channel[i]! / channels.length;
	}
	return mono;
}

function rootMeanSquare(x: Float32Array): number {
	let sum = 0;
	for (const value of x) sum += value * value;
	return x.length > 0 ? Math.sqrt(sum / x.length) : 0;
}

function hannWindow(size: number): Float64Array {
	const window = new Float64Array(size);
	for (let i = 0; i < size; i++) {
		window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size);
	}
	return window;
}

function ramp(x: number): number {
	const clamped = Math.max(0, Math.min(1, x));
	return 0.5 - 0.5 * Math.cos(Math.PI * clamped);
}

function median(values: number[]): number {
	if (values.length === 0) return 0;
	const sorted = values.toSorted((a, b) => a - b);
	const mid = sorted.length >> 1;
	return sorted.length % 2 === 1
		? sorted[mid]!
		: (sorted[mid - 1]! + sorted[mid]!) / 2;
}
