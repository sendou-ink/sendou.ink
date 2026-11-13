import { describe, expect, test } from "vitest";
import { ART_PER_PAGE } from "../art-constants";
import type { ListedArt } from "../art-types";
import * as ArtListing from "./ArtListing";

const OTHER_ARTIST: NonNullable<ListedArt["author"]> = {
	id: 2,
	username: "Other",
	avatar: null,
	commissionsOpen: 0,
};

const ownArt = (id: number, tags: string[] = []) => art(id, { tags });
const artOfUser = (id: number, tags: string[] = []) =>
	art(id, { tags, author: OTHER_ARTIST });

describe("ArtListing.filterUserArts", () => {
	const arts = [ownArt(1, ["cat"]), ownArt(2), artOfUser(3, ["cat"])];

	test.each([
		{ source: "ALL", expected: [1, 2, 3] },
		{ source: "MADE-BY", expected: [1, 2] },
		{ source: "MADE-OF", expected: [3] },
	] as const)("source $source", ({ source, expected }) => {
		expect(ids(ArtListing.filterUserArts(arts, { source, tag: null }))).toEqual(
			expected,
		);
	});

	test("ignores the source when the user has art of one source only", () => {
		const onlyOwn = [ownArt(1), ownArt(2)];

		expect(
			ids(ArtListing.filterUserArts(onlyOwn, { source: "MADE-OF", tag: null })),
		).toEqual([1, 2]);
	});

	test("narrows to the art having the tag, on top of the source", () => {
		expect(
			ids(ArtListing.filterUserArts(arts, { source: "MADE-BY", tag: "cat" })),
		).toEqual([1]);
	});
});

describe("ArtListing.hasBothSources", () => {
	test.each([
		{
			why: "own and of the user",
			arts: [ownArt(1), artOfUser(2)],
			expected: true,
		},
		{ why: "own only", arts: [ownArt(1)], expected: false },
		{ why: "of the user only", arts: [artOfUser(1)], expected: false },
		{ why: "none", arts: [], expected: false },
	])("$why → $expected", ({ arts, expected }) => {
		expect(ArtListing.hasBothSources(arts)).toBe(expected);
	});
});

describe("ArtListing.tagCounts", () => {
	test("counts each tag, most used first", () => {
		const arts = [
			ownArt(1, ["cat"]),
			ownArt(2, ["dog", "cat"]),
			ownArt(3, ["dog", "cat"]),
			ownArt(4, ["bird"]),
		];

		expect(ArtListing.tagCounts(arts)).toEqual([
			["cat", 3],
			["dog", 2],
			["bird", 1],
		]);
	});

	test("returns null when no art has tags", () => {
		expect(ArtListing.tagCounts([ownArt(1), ownArt(2)])).toBeNull();
	});
});

describe("ArtListing.withCommissionsOpen", () => {
	test("keeps the art of artists with commissions open only", () => {
		const arts = [
			art(1, { author: { ...OTHER_ARTIST, commissionsOpen: 1 } }),
			art(2, { author: OTHER_ARTIST }),
			ownArt(3),
		];

		expect(ids(ArtListing.withCommissionsOpen(arts))).toEqual([1]);
	});
});

describe("ArtListing.pageOf", () => {
	const arts = Array.from({ length: ART_PER_PAGE * 2 + 1 }, (_, i) => ({
		id: i + 1,
	}));

	test.each([
		{ why: "first art", artId: 1, expected: 1 },
		{ why: "last art of the first page", artId: ART_PER_PAGE, expected: 1 },
		{
			why: "first art of the second page",
			artId: ART_PER_PAGE + 1,
			expected: 2,
		},
		{
			why: "art alone on the last page",
			artId: ART_PER_PAGE * 2 + 1,
			expected: 3,
		},
		{ why: "art not in the list", artId: 999, expected: 1 },
		{ why: "no art", artId: null, expected: 1 },
	])("$why → page $expected", ({ artId, expected }) => {
		expect(ArtListing.pageOf(arts, artId)).toBe(expected);
	});
});

function art(
	id: number,
	{ tags = [], author }: { tags?: string[]; author?: ListedArt["author"] },
): Pick<ListedArt, "id" | "author" | "tags"> {
	return {
		id,
		author,
		tags:
			tags.length > 0 ? tags.map((name, i) => ({ id: i, name })) : undefined,
	};
}

function ids(arts: Array<{ id: number }>) {
	return arts.map((a) => a.id);
}
