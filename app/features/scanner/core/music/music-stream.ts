/**
 * music-removal.ts for sound too long to hold whole (a VoD of hours), in
 * two passes over it:
 *
 * 1. `createMusicFinder`: the sound, mixed to mono, in overlapping windows
 *    of a minute and a half. Each window is searched like a clip
 *    (`findMusic`) and keeps what it found in its middle, away from its
 *    edges where the search has less to go on. The result is the music's
 *    segments over the whole sound, a few hundred bytes per game.
 * 2. `createMusicSubtractor`: the sound again, every channel, in chunks
 *    with seconds of margin either side, so each chunk comes out as if the
 *    whole was subtracted at once. Chunks no segment reaches pass through.
 *
 * Both take the sound in blocks of any size as it is decoded and hold at
 * most a few windows or chunks of it.
 */
import type { MusicIndex } from "./fingerprint";
import {
	type AlignedSegment,
	findMusic,
	renderReference,
	stftSize,
	subtractReference,
} from "./music-removal";

const FIND_WINDOW_SECONDS = 90;
const FIND_OVERLAP_SECONDS = 20;
const SUBTRACT_CHUNK_SECONDS = 30;
/** several times the gain's smoothing time, so a chunk's edges don't show */
const SUBTRACT_MARGIN_SECONDS = 3;
/** a segment's crossfade reaches this far past its ends */
const SEGMENT_REACH_SECONDS = 0.05;
const MAX_LOW_TRACKS_KEPT = 8;

/**
 * Pass 1: `push` the sound mixed to mono, block by block, then `finish`
 * for the music's segments over all of it (seconds from the first
 * sample). `loadLowTrack` is as for `findMusic`.
 */
export function createMusicFinder({
	sampleRate,
	index,
	loadLowTrack,
	onWindow,
}: {
	sampleRate: number;
	index: MusicIndex;
	loadLowTrack: (track: number) => Promise<Float32Array>;
	/** called after each window searched, with how far the search is, seconds */
	onWindow?: (seconds: number) => void;
}) {
	const windowLength = Math.round(FIND_WINDOW_SECONDS * sampleRate);
	const overlap = Math.round(FIND_OVERLAP_SECONDS * sampleRate);
	const hop = windowLength - overlap;
	const buffer = new SampleBuffer(1);
	const segments: AlignedSegment[] = [];
	const lowTracks = new Map<number, Float32Array>();
	let windowStart = 0;
	let coreStart = 0;

	const cachedLowTrack = async (track: number) => {
		let low = lowTracks.get(track);
		if (low) {
			lowTracks.delete(track);
		} else {
			low = await loadLowTrack(track);
			if (lowTracks.size >= MAX_LOW_TRACKS_KEPT) {
				lowTracks.delete(lowTracks.keys().next().value!);
			}
		}
		lowTracks.set(track, low);
		return low;
	};

	const search = async (start: number, end: number, coreEnd: number) => {
		const found = await findMusic(buffer.read(start, end)[0]!, sampleRate, {
			index,
			loadLowTrack: cachedLowTrack,
		});
		const shift = start / sampleRate;
		const from = coreStart / sampleRate;
		const to = coreEnd / sampleRate;
		for (const segment of found) {
			const kept = {
				...segment,
				start: Math.max(from, segment.start + shift),
				end: Math.min(to, segment.end + shift),
				offset: segment.offset - (1 + segment.drift) * shift,
			};
			if (kept.end > kept.start) segments.push(kept);
		}
		coreStart = coreEnd;
		onWindow?.(to);
	};

	return {
		async push(mono: Float32Array) {
			buffer.append([mono]);
			while (buffer.end >= windowStart + windowLength) {
				await search(
					windowStart,
					windowStart + windowLength,
					windowStart + windowLength - overlap / 2,
				);
				// the last window may reach back to here, never further
				buffer.discardBefore(windowStart);
				windowStart += hop;
			}
		},
		async finish(): Promise<AlignedSegment[]> {
			if (buffer.end > coreStart) {
				await search(
					Math.max(0, buffer.end - windowLength),
					buffer.end,
					buffer.end,
				);
			}
			return segments;
		},
	};
}

/**
 * Pass 2: `push` the sound's channels block by block and get back the
 * same sound with the `segments` (from `createMusicFinder`) taken out; it
 * comes back a chunk and a margin behind, `flush` gives the rest.
 * `loadTrack` gives a track's channels at `sampleRate`.
 */
export function createMusicSubtractor({
	segments,
	sampleRate,
	numberOfChannels,
	loadTrack,
}: {
	segments: AlignedSegment[];
	sampleRate: number;
	numberOfChannels: number;
	loadTrack: (track: number) => Promise<Float32Array[]>;
}) {
	const hop = stftSize(sampleRate) / 4;
	const onHop = (seconds: number) =>
		Math.max(1, Math.round((seconds * sampleRate) / hop)) * hop;
	const chunk = onHop(SUBTRACT_CHUNK_SECONDS);
	const margin = onHop(SUBTRACT_MARGIN_SECONDS);
	const buffer = new SampleBuffer(numberOfChannels);
	const tracks = new Map<number, Float32Array[]>();
	let emitted = 0;

	const subtractChunk = async (chunkEnd: number): Promise<Float32Array[]> => {
		const from = Math.max(0, emitted - margin);
		const to = Math.min(buffer.end, chunkEnd + margin);
		const reach = SEGMENT_REACH_SECONDS * sampleRate;
		const active = segments.filter(
			(segment) =>
				segment.end * sampleRate + reach > from &&
				segment.start * sampleRate - reach < to,
		);
		const neededTracks = new Set(active.map((segment) => segment.track));
		for (const track of tracks.keys()) {
			if (!neededTracks.has(track)) tracks.delete(track);
		}
		let out: Float32Array[];
		if (active.length === 0) {
			out = buffer.read(emitted, chunkEnd);
		} else {
			for (const track of neededTracks) {
				if (!tracks.has(track)) tracks.set(track, await loadTrack(track));
			}
			out = buffer.read(from, to).map((signal, c) => {
				const reference = renderReference(active, {
					trackChannel: (track) => {
						const trackChannels = tracks.get(track)!;
						return trackChannels[Math.min(c, trackChannels.length - 1)]!;
					},
					from,
					length: to - from,
					sampleRate,
				});
				return subtractReference(signal, reference, sampleRate).slice(
					emitted - from,
					chunkEnd - from,
				);
			});
		}
		emitted = chunkEnd;
		buffer.discardBefore(emitted - margin);
		return out;
	};

	return {
		async push(channels: Float32Array[]): Promise<Float32Array[]> {
			buffer.append(channels);
			const blocks: Float32Array[][] = [];
			while (buffer.end >= emitted + chunk + margin) {
				blocks.push(await subtractChunk(emitted + chunk));
			}
			return concatenate(blocks, numberOfChannels);
		},
		async flush(): Promise<Float32Array[]> {
			const blocks: Float32Array[][] = [];
			while (emitted < buffer.end) {
				blocks.push(await subtractChunk(Math.min(buffer.end, emitted + chunk)));
			}
			return concatenate(blocks, numberOfChannels);
		},
	};
}

/** The windows and chunks of a stream of channels still needed, by absolute sample index. */
class SampleBuffer {
	private channels: Float32Array[];
	/** absolute index of `channels`' first sample */
	start = 0;
	/** absolute index one past the last sample appended */
	end = 0;

	constructor(numberOfChannels: number) {
		this.channels = Array.from(
			{ length: numberOfChannels },
			() => new Float32Array(0),
		);
	}

	append(blocks: Float32Array[]) {
		const length = blocks[0]?.length ?? 0;
		const held = this.end - this.start;
		if (held + length > (this.channels[0]?.length ?? 0)) {
			const capacity = Math.max(1024, 2 * (held + length));
			this.channels = this.channels.map((channel) => {
				const grown = new Float32Array(capacity);
				grown.set(channel.subarray(0, held));
				return grown;
			});
		}
		for (const [c, channel] of this.channels.entries()) {
			channel.set(blocks[Math.min(c, blocks.length - 1)]!, held);
		}
		this.end += length;
	}

	/** a copy of `[from, to)`, which must still be held */
	read(from: number, to: number): Float32Array[] {
		return this.channels.map((channel) =>
			channel.slice(from - this.start, to - this.start),
		);
	}

	discardBefore(index: number) {
		const drop = Math.min(index, this.end) - this.start;
		if (drop <= 0) return;
		const held = this.end - this.start;
		for (const channel of this.channels) {
			channel.copyWithin(0, drop, held);
		}
		this.start += drop;
	}
}

function concatenate(
	blocks: Float32Array[][],
	numberOfChannels: number,
): Float32Array[] {
	if (blocks.length === 1) return blocks[0]!;
	const length = blocks.reduce((sum, block) => sum + block[0]!.length, 0);
	return Array.from({ length: numberOfChannels }, (_, c) => {
		const channel = new Float32Array(length);
		let at = 0;
		for (const block of blocks) {
			channel.set(block[c]!, at);
			at += block[c]!.length;
		}
		return channel;
	});
}
