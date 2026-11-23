/**
 * Where the producer's music is at any moment, worked out from the playlist and when it started rather than told
 * track by track: every overlay (and an OBS source loading again) plays the same spot, and the server only stores the
 * playlist, its start and whether it's paused. Shuffled, every time through the playlist is in an order of its own,
 * mixed the same way everywhere from the stored seed.
 */
import { seededRandom } from "~/utils/random";
import type { BroadcastMusic, BroadcastMusicTrack } from "../broadcast-types";

/** Once the track playing has played this long "previous" starts it over, before that it goes to the track before. */
const RESTART_AFTER_MS = 3_000;

/** The track the playlist is at and how far into it. */
interface MusicPosition {
	/** Of the track in this time through the playlist's order. */
	index: number;
	track: BroadcastMusicTrack;
	positionMs: number;
	isPaused: boolean;
}

/** The playlist starting from its first track at `now`, in order. */
export function start({
	tracks,
	volume,
	now,
}: {
	tracks: BroadcastMusicTrack[];
	volume: number;
	now: number;
}): BroadcastMusic {
	return {
		tracks,
		startedAt: now,
		pausedAtMs: null,
		volume,
		shuffleSeed: null,
	};
}

/**
 * Where the playlist is at `now` (epoch ms of the server), the last track followed by the first (shuffled, by the
 * first of the next order). `null` without tracks.
 */
export function current(
	music: BroadcastMusic | null,
	now: number,
): MusicPosition | null {
	if (!music) return null;

	const place = placeOf(music, now);
	if (!place) return null;

	return {
		index: place.slot,
		track: place.order[place.slot],
		positionMs: place.positionMs,
		isPaused: music.pausedAtMs !== null,
	};
}

/** Pauses where the playlist is at `now`, an already paused one staying as it is. */
export function pause(music: BroadcastMusic, now: number): BroadcastMusic {
	if (music.pausedAtMs !== null) return music;

	return { ...music, pausedAtMs: now - music.startedAt };
}

/** Plays on from where the playlist was paused, a playing one staying as it is. */
export function resume(music: BroadcastMusic, now: number): BroadcastMusic {
	if (music.pausedAtMs === null) return music;

	return { ...music, startedAt: now - music.pausedAtMs, pausedAtMs: null };
}

/**
 * Goes to the start of the next track, or with `previous` to the start of the one before (the track playing starting
 * over once it has played a few seconds). The last track and the first follow each other. Paused stays paused.
 */
export function skip(
	music: BroadcastMusic,
	now: number,
	direction: "next" | "previous",
): BroadcastMusic {
	const place = placeOf(music, now);
	if (!place) return music;

	const slot =
		direction === "next"
			? place.slot + 1
			: place.positionMs >= RESTART_AFTER_MS
				? place.slot
				: place.slot - 1;

	return atSlot(music, { loop: place.loop, slot, positionMs: 0, now });
}

/**
 * The playlist with its tracks changed (e.g. reordered, edited or one removed), the track playing playing on from
 * where it is. One removed is followed by the track after it, from its start.
 */
export function withTracks(
	music: BroadcastMusic,
	tracks: BroadcastMusicTrack[],
	now: number,
): BroadcastMusic {
	return rearranged(music, { ...music, tracks }, now);
}

/**
 * Shuffles the playlist (from `seed`, mixing it anew every time through) or puts it back in order, the track playing
 * playing on from where it is.
 */
export function withShuffle(
	music: BroadcastMusic,
	{ isShuffled, seed, now }: { isShuffled: boolean; seed: number; now: number },
): BroadcastMusic {
	return rearranged(
		music,
		{ ...music, shuffleSeed: isShuffled ? seed : null },
		now,
	);
}

/** Whether the playlist plays shuffled. */
export function playsShuffled(music: BroadcastMusic) {
	return typeof music.shuffleSeed === "number";
}

/** The changed playlist with the track playing in the old one playing on from where it is, or the track in its spot from its start. */
function rearranged(
	music: BroadcastMusic,
	changed: BroadcastMusic,
	now: number,
): BroadcastMusic {
	const place = placeOf(music, now);
	if (!place || changed.tracks.length === 0) return at(changed, 0, now);

	const playingTrack = place.order[place.slot];
	const order = orderOf(changed, place.loop);
	const slot = order.findIndex((track) => track.id === playingTrack.id);
	if (slot === -1) {
		return atSlot(changed, {
			loop: place.loop,
			slot: place.slot,
			positionMs: 0,
			now,
		});
	}

	return atSlot(changed, {
		loop: place.loop,
		slot,
		positionMs: Math.min(place.positionMs, order[slot].durationMs - 1),
		now,
	});
}

/** Which time through the playlist it is at `now`, the order of that time, its track playing and how far into it. */
function placeOf(music: BroadcastMusic, now: number) {
	const totalMs = totalMsOf(music.tracks);
	if (totalMs <= 0) return null;

	const elapsed = music.pausedAtMs ?? now - music.startedAt;
	const loop = Math.floor(elapsed / totalMs);
	const order = orderOf(music, loop);
	const withinLoop = elapsed - loop * totalMs;

	let startMs = 0;
	for (const [slot, track] of order.entries()) {
		if (withinLoop < startMs + track.durationMs) {
			return { loop, order, slot, positionMs: withinLoop - startMs };
		}
		startMs += track.durationMs;
	}

	return null;
}

/** The playlist at `positionMs` into the track of `slot` of its `loop`th time through, a slot past either end carrying over to the next or previous time. */
function atSlot(
	music: BroadcastMusic,
	{
		loop,
		slot,
		positionMs,
		now,
	}: { loop: number; slot: number; positionMs: number; now: number },
) {
	const count = music.tracks.length;
	const slotLoop = loop + Math.floor(slot / count);
	const order = orderOf(music, slotLoop);
	const elapsed =
		slotLoop * totalMsOf(music.tracks) +
		totalMsOf(order.slice(0, modulo(slot, count))) +
		positionMs;

	return at(music, elapsed, now);
}

/** The playlist at `elapsed` into it at `now`, paused there when paused. */
function at(
	music: BroadcastMusic,
	elapsed: number,
	now: number,
): BroadcastMusic {
	return music.pausedAtMs === null
		? { ...music, startedAt: now - elapsed }
		: { ...music, pausedAtMs: elapsed };
}

/**
 * The tracks in the order of the playlist's `loop`th time through: as they are, or shuffled. A shuffled order doesn't
 * start with the track the one before it ended with (with 3 tracks or more).
 */
function orderOf(music: BroadcastMusic, loop: number) {
	const seed = music.shuffleSeed;
	if (typeof seed !== "number" || music.tracks.length < 2) return music.tracks;

	const order = shuffled(music.tracks, seed, loop);
	const previousLast = shuffled(music.tracks, seed, loop - 1).at(-1);
	if (music.tracks.length >= 3 && order[0].id === previousLast?.id) {
		[order[0], order[1]] = [order[1], order[0]];
	}

	return order;
}

/** The tracks shuffled from the seed and the loop, the same on every machine. */
function shuffled(tracks: BroadcastMusicTrack[], seed: number, loop: number) {
	return seededRandom(`${seed}-${loop}`).seededShuffle(tracks);
}

function totalMsOf(tracks: BroadcastMusicTrack[]) {
	return tracks.reduce((sum, track) => sum + track.durationMs, 0);
}

function modulo(value: number, length: number) {
	return ((value % length) + length) % length;
}
