import { describe, expect, test } from "vitest";
import type { ScannerClip } from "~/features/scanner/store/clips";
import { clipsFor, keptClipIds, recentClipIds } from "./broadcast-cast-clips";

const BROADCAST = { tournamentId: 1, slug: "sendouink" };

const ids = (count: number) =>
	Array.from({ length: count }, (_, idx) => `clip-${idx + 1}`);

describe("keptClipIds", () => {
	test.each([
		{
			why: "the newest stored up to five",
			pickedIds: [],
			recentIds: [],
			storedIds: ids(7),
			expected: ids(5),
		},
		{
			why: "a picked clip before newer ones",
			pickedIds: ["clip-7"],
			recentIds: [],
			storedIds: ids(7),
			expected: ["clip-7", ...ids(4)],
		},
		{
			why: "every picked clip when more than five are picked",
			pickedIds: ids(7).toReversed(),
			recentIds: [],
			storedIds: ids(7),
			expected: ids(7).toReversed(),
		},
		{
			why: "a recently picked clip after it was unpicked",
			pickedIds: [],
			recentIds: ["clip-7"],
			storedIds: ids(7),
			expected: ["clip-7", ...ids(4)],
		},
		{
			why: "no picked clip missing from the store",
			pickedIds: ["gone"],
			recentIds: ["gone"],
			storedIds: ids(2),
			expected: ids(2),
		},
	])("keeps $why", ({ pickedIds, recentIds, storedIds, expected }) => {
		expect(keptClipIds({ pickedIds, recentIds, storedIds })).toEqual(expected);
	});
});

describe("recentClipIds", () => {
	test.each([
		{
			why: "puts the picked ones first",
			pickedIds: ["clip-3"],
			recentIds: ["clip-1", "clip-2"],
			expected: ["clip-3", "clip-1", "clip-2"],
		},
		{
			why: "keeps a clip picked again once",
			pickedIds: ["clip-2"],
			recentIds: ["clip-1", "clip-2"],
			expected: ["clip-2", "clip-1"],
		},
		{
			why: "forgets the oldest past five",
			pickedIds: ["clip-6"],
			recentIds: ids(5),
			expected: ["clip-6", ...ids(4)],
		},
	])("$why", ({ pickedIds, recentIds, expected }) => {
		expect(recentClipIds({ pickedIds, recentIds })).toEqual(expected);
	});
});

describe("clipsFor", () => {
	test("keeps the broadcast's live clips, newest first", () => {
		const older = clip({ id: 1, createdAt: 1_000 });
		const newer = clip({ id: 2, createdAt: 2_000 });

		expect(
			clipsFor(
				[
					older,
					clip({ id: 3, broadcast: { tournamentId: 2, slug: "sendouink" } }),
					clip({ id: 4, broadcast: { tournamentId: 1, slug: "other" } }),
					clip({ id: 5, broadcast: undefined }),
					clip({ id: 6, source: { kind: "vod", name: "a.mp4", visit: "1" } }),
					newer,
				],
				BROADCAST,
			).map((kept) => kept.id),
		).toEqual([2, 1]);
	});
});

function clip(overrides: Partial<ScannerClip>): ScannerClip {
	return {
		id: 1,
		createdAt: 1_000,
		bucket: "session",
		source: { kind: "live", sessionKey: 1 },
		start: 0,
		end: 10,
		t: 5,
		time: null,
		score: 4,
		kills: 2,
		mode: null,
		stage: null,
		hasAudio: true,
		broadcast: BROADCAST,
		...overrides,
	};
}
