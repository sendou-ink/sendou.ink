import { describe, expect, test } from "vitest";
import * as BadgeListing from "./BadgeListing";

const VIEWER_ID = 1;

const badge = (displayName: string, managerIds: number[] = []) => ({
	displayName,
	permissions: { MANAGE: managerIds },
});

const BADGES = [
	badge("In The Zone", [VIEWER_ID]),
	badge("Swim or Sink"),
	badge("Zones Weekly", [2]),
];

const names = (badges: Array<{ displayName: string }>) =>
	badges.map((b) => b.displayName);

describe("BadgeListing.split", () => {
	test("lists the badges the viewer manages apart from the rest", () => {
		const { managed, other } = BadgeListing.split(BADGES, {
			viewerId: VIEWER_ID,
			search: "",
		});

		expect(names(managed)).toEqual(["In The Zone"]);
		expect(names(other)).toEqual(["Swim or Sink", "Zones Weekly"]);
	});

	test("puts every badge under other without a viewer", () => {
		const { managed, other } = BadgeListing.split(BADGES, {
			viewerId: undefined,
			search: "",
		});

		expect(managed).toEqual([]);
		expect(other).toHaveLength(3);
	});

	test("keeps only the badges whose name contains the search, ignoring case", () => {
		const { managed, other } = BadgeListing.split(BADGES, {
			viewerId: VIEWER_ID,
			search: "zone",
		});

		expect(names(managed)).toEqual(["In The Zone"]);
		expect(names(other)).toEqual(["Zones Weekly"]);
	});
});
