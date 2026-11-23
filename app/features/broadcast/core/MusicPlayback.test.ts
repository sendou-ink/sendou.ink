import { describe, expect, test } from "vitest";
import type { BroadcastMusicTrack } from "../broadcast-types";
import * as MusicPlayback from "./MusicPlayback";

const STARTED_AT = 1_000_000;

const tracks = [track("a", 60_000), track("b", 30_000), track("c", 90_000)];

const playing = MusicPlayback.start({ tracks, volume: 80, now: STARTED_AT });

describe("MusicPlayback.current", () => {
	test.each([
		{ why: "first track at its start", afterMs: 0, id: "a", positionMs: 0 },
		{
			why: "into the first track",
			afterMs: 59_999,
			id: "a",
			positionMs: 59_999,
		},
		{ why: "second track", afterMs: 75_000, id: "b", positionMs: 15_000 },
		{ why: "last track", afterMs: 179_000, id: "c", positionMs: 89_000 },
		{
			why: "loop back to the first",
			afterMs: 185_000,
			id: "a",
			positionMs: 5_000,
		},
		{
			why: "many loops later",
			afterMs: 180_000 * 7 + 70_000,
			id: "b",
			positionMs: 10_000,
		},
		{
			why: "a clock behind the start",
			afterMs: -10_000,
			id: "c",
			positionMs: 80_000,
		},
	])("$why", ({ afterMs, id, positionMs }) => {
		expect(MusicPlayback.current(playing, STARTED_AT + afterMs)).toEqual(
			expect.objectContaining({
				track: tracks.find((t) => t.id === id),
				positionMs,
			}),
		);
	});

	test("is null without music", () => {
		expect(MusicPlayback.current(null, STARTED_AT)).toBeNull();
	});

	test("is null without tracks", () => {
		expect(
			MusicPlayback.current({ ...playing, tracks: [] }, STARTED_AT),
		).toBeNull();
	});
});

describe("MusicPlayback.pause", () => {
	test("stays where it was paused however long it is paused", () => {
		const paused = MusicPlayback.pause(playing, STARTED_AT + 70_000);

		expect(MusicPlayback.current(paused, STARTED_AT + 999_999)).toEqual(
			expect.objectContaining({
				track: tracks[1],
				positionMs: 10_000,
				isPaused: true,
			}),
		);
	});

	test("plays on from the same spot when resumed", () => {
		const paused = MusicPlayback.pause(playing, STARTED_AT + 70_000);
		const resumedAt = STARTED_AT + 500_000;
		const resumed = MusicPlayback.resume(paused, resumedAt);

		expect(MusicPlayback.current(resumed, resumedAt + 5_000)).toEqual(
			expect.objectContaining({
				track: tracks[1],
				positionMs: 15_000,
				isPaused: false,
			}),
		);
	});

	test("pausing a paused playlist leaves it as it is", () => {
		const paused = MusicPlayback.pause(playing, STARTED_AT + 70_000);

		expect(MusicPlayback.pause(paused, STARTED_AT + 90_000)).toBe(paused);
	});
});

describe("MusicPlayback.skip", () => {
	test.each([
		{ why: "next from the first", afterMs: 10_000, direction: "next", id: "b" },
		{
			why: "next from the last loops",
			afterMs: 100_000,
			direction: "next",
			id: "a",
		},
		{
			why: "previous early in a track",
			afterMs: 61_000,
			direction: "previous",
			id: "a",
		},
		{
			why: "previous early in the first loops",
			afterMs: 1_000,
			direction: "previous",
			id: "c",
		},
		{
			why: "previous later in a track starts it over",
			afterMs: 70_000,
			direction: "previous",
			id: "b",
		},
	] as const)("$why", ({ afterMs, direction, id }) => {
		const now = STARTED_AT + afterMs;
		const skipped = MusicPlayback.skip(playing, now, direction);

		expect(MusicPlayback.current(skipped, now)).toEqual(
			expect.objectContaining({
				track: tracks.find((t) => t.id === id),
				positionMs: 0,
			}),
		);
	});

	test("a paused playlist stays paused at the start of the next track", () => {
		const paused = MusicPlayback.pause(playing, STARTED_AT + 10_000);
		const skipped = MusicPlayback.skip(paused, STARTED_AT + 50_000, "next");

		expect(MusicPlayback.current(skipped, STARTED_AT + 90_000)).toEqual(
			expect.objectContaining({
				track: tracks[1],
				positionMs: 0,
				isPaused: true,
			}),
		);
	});
});

describe("MusicPlayback.withTracks", () => {
	const now = STARTED_AT + 75_000;

	test("the track playing plays on from where it is in its new spot", () => {
		const reordered = MusicPlayback.withTracks(
			playing,
			[tracks[2], tracks[0], tracks[1]],
			now,
		);

		expect(MusicPlayback.current(reordered, now)).toEqual(
			expect.objectContaining({
				index: 2,
				track: tracks[1],
				positionMs: 15_000,
			}),
		);
	});

	test("the track after one removed while playing plays from its start", () => {
		const removed = MusicPlayback.withTracks(
			playing,
			[tracks[0], tracks[2]],
			now,
		);

		expect(MusicPlayback.current(removed, now)).toEqual(
			expect.objectContaining({ track: tracks[2], positionMs: 0 }),
		);
	});

	test("the first track follows the last one removed while playing", () => {
		const atLast = STARTED_AT + 100_000;
		const removed = MusicPlayback.withTracks(
			playing,
			[tracks[0], tracks[1]],
			atLast,
		);

		expect(MusicPlayback.current(removed, atLast)).toEqual(
			expect.objectContaining({ track: tracks[0], positionMs: 0 }),
		);
	});

	test("an edited track keeps playing from where it is", () => {
		const renamed = { ...tracks[1], title: "Renamed" };
		const edited = MusicPlayback.withTracks(
			playing,
			[tracks[0], renamed, tracks[2]],
			now,
		);

		expect(MusicPlayback.current(edited, now)).toEqual(
			expect.objectContaining({ track: renamed, positionMs: 15_000 }),
		);
	});

	test("stays paused", () => {
		const paused = MusicPlayback.pause(playing, now);
		const reordered = MusicPlayback.withTracks(
			paused,
			[tracks[1], tracks[0], tracks[2]],
			now + 10_000,
		);

		expect(MusicPlayback.current(reordered, now + 60_000)).toEqual(
			expect.objectContaining({
				index: 0,
				track: tracks[1],
				positionMs: 15_000,
				isPaused: true,
			}),
		);
	});
});

describe("MusicPlayback.withShuffle", () => {
	const sixTracks = ["a", "b", "c", "d", "e", "f"].map((id) =>
		track(id, 10_000),
	);
	const loopMs = 60_000;
	// started shuffled, so each time through the playlist begins on a whole loop
	const shuffledMusic = {
		...MusicPlayback.start({ tracks: sixTracks, volume: 80, now: STARTED_AT }),
		shuffleSeed: 42,
	};

	const orderOfLoop = (loop: number) =>
		sixTracks.map(
			(_, slot) =>
				MusicPlayback.current(
					shuffledMusic,
					STARTED_AT + loop * loopMs + slot * 10_000,
				)!.track.id,
		);

	test("plays every track once each time through the playlist", () => {
		for (const loop of [0, 1, 2, 7]) {
			expect(orderOfLoop(loop).toSorted((a, b) => a.localeCompare(b))).toEqual([
				"a",
				"b",
				"c",
				"d",
				"e",
				"f",
			]);
		}
	});

	test("mixes the order anew each time through the playlist", () => {
		const orders = new Set(
			[0, 1, 2, 3, 4].map((loop) => orderOfLoop(loop).join("")),
		);

		expect(orders.size).toBeGreaterThan(1);
	});

	test("mixes it the same way every time from the same seed", () => {
		const again = MusicPlayback.withShuffle(
			MusicPlayback.start({ tracks: sixTracks, volume: 80, now: STARTED_AT }),
			{ isShuffled: true, seed: 42, now: STARTED_AT },
		);
		const shuffledOn = MusicPlayback.withShuffle(
			MusicPlayback.start({ tracks: sixTracks, volume: 80, now: STARTED_AT }),
			{ isShuffled: true, seed: 42, now: STARTED_AT },
		);

		expect(
			MusicPlayback.current(again, STARTED_AT + 3 * loopMs + 25_000),
		).toEqual(
			MusicPlayback.current(shuffledOn, STARTED_AT + 3 * loopMs + 25_000),
		);
	});

	test("doesn't play the same track twice in a row as the playlist starts over", () => {
		for (let loop = 1; loop < 50; loop++) {
			expect(orderOfLoop(loop)[0]).not.toBe(orderOfLoop(loop - 1).at(-1));
		}
	});

	test.each([
		{ why: "turned on", isShuffled: true },
		{ why: "turned off", isShuffled: false },
	])(
		"the track playing plays on from where it is when $why",
		({ isShuffled }) => {
			const now = STARTED_AT + 75_000;
			const from = isShuffled ? playing : shuffledMusic;
			const before = MusicPlayback.current(from, now)!;

			const after = MusicPlayback.withShuffle(from, {
				isShuffled,
				seed: 7,
				now,
			});

			expect(MusicPlayback.current(after, now)).toEqual(
				expect.objectContaining({
					track: before.track,
					positionMs: before.positionMs,
				}),
			);
			expect(MusicPlayback.playsShuffled(after)).toBe(isShuffled);
		},
	);

	test("goes from the last track to the first of the next order", () => {
		const atLast = STARTED_AT + 2 * loopMs + 55_000;

		const skipped = MusicPlayback.skip(shuffledMusic, atLast, "next");

		expect(MusicPlayback.current(skipped, atLast)).toEqual(
			expect.objectContaining({
				track: expect.objectContaining({ id: orderOfLoop(3)[0] }),
				positionMs: 0,
			}),
		);
	});

	test("stays on the track it was paused on in a later time through", () => {
		const now = STARTED_AT + 4 * loopMs + 33_000;
		const before = MusicPlayback.current(shuffledMusic, now)!;

		const paused = MusicPlayback.pause(shuffledMusic, now);

		expect(MusicPlayback.current(paused, now + 999_999)).toEqual(
			expect.objectContaining({
				track: before.track,
				positionMs: before.positionMs,
			}),
		);
	});
});

function track(id: string, durationMs: number): BroadcastMusicTrack {
	return {
		id,
		durationMs,
		title: `Track ${id}`,
		artist: null,
	};
}
