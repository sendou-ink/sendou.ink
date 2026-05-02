import type { TFunction } from "i18next";
import { describe, expect, test } from "vitest";
import type { SendouQMatchLoaderData } from "../loaders/q.match.$id.server";
import {
	resolveGroupNames,
	resolveMatchScore,
	resolveTimelineMaps,
	resolveTimelineSpChanges,
	resolveTimelineTeams,
} from "./match-timeline";

type MatchData = SendouQMatchLoaderData["match"];

const ALPHA_ID = 10;
const BRAVO_ID = 20;

const t = ((key: string) => key) as unknown as TFunction<["q"]>;

function member(overrides: Record<string, unknown> = {}) {
	return {
		id: 1,
		username: "user",
		discordId: "d",
		discordAvatar: null,
		customUrl: null,
		skillDifference: undefined,
		...overrides,
	};
}

function matchWith(overrides: Record<string, unknown> = {}): MatchData {
	return {
		createdAt: 1_700_000_000,
		mapList: [],
		groupAlpha: {
			id: ALPHA_ID,
			team: null,
			members: [],
		},
		groupBravo: {
			id: BRAVO_ID,
			team: null,
			members: [],
		},
		...overrides,
	} as unknown as MatchData;
}

describe("resolveGroupNames()", () => {
	test("uses team names when both sides have a registered team", () => {
		const result = resolveGroupNames(
			matchWith({
				groupAlpha: { id: ALPHA_ID, team: { name: "Squids" }, members: [] },
				groupBravo: { id: BRAVO_ID, team: { name: "Octos" }, members: [] },
			}),
			t,
		);

		expect(result).toEqual({ alpha: "Squids", bravo: "Octos" });
	});

	test("falls back to translation keys when team is missing", () => {
		const result = resolveGroupNames(matchWith(), t);

		expect(result).toEqual({
			alpha: "q:match.groupAlpha",
			bravo: "q:match.groupBravo",
		});
	});
});

describe("resolveTimelineTeams()", () => {
	test("exposes avatar url when the team has one", () => {
		const result = resolveTimelineTeams(
			matchWith({
				groupAlpha: {
					id: ALPHA_ID,
					team: { name: "Squids", avatarUrl: "a.png" },
					members: [],
				},
				groupBravo: { id: BRAVO_ID, team: null, members: [] },
			}),
			t,
		);

		expect(result.alpha.avatar).toBe("a.png");
		expect(result.bravo.avatar).toBeUndefined();
	});
});

describe("resolveTimelineMaps()", () => {
	test("filters out maps that have not been reported", () => {
		const result = resolveTimelineMaps(
			matchWith({
				mapList: [
					{ id: 1, stageId: 1, mode: "SZ", winnerGroupId: ALPHA_ID },
					{ id: 2, stageId: 2, mode: "TC", winnerGroupId: null },
				],
			}),
			[],
		);

		expect(result).toHaveLength(1);
		expect(result[0].winner).toBe("ALPHA");
	});

	test("resolves winner based on matching group id", () => {
		const result = resolveTimelineMaps(
			matchWith({
				mapList: [{ id: 1, stageId: 1, mode: "SZ", winnerGroupId: BRAVO_ID }],
			}),
			[],
		);

		expect(result[0].winner).toBe("BRAVO");
	});

	test("omits weapons when nothing is reported", () => {
		const result = resolveTimelineMaps(
			matchWith({
				mapList: [{ id: 1, stageId: 1, mode: "SZ", winnerGroupId: ALPHA_ID }],
				groupAlpha: {
					id: ALPHA_ID,
					team: null,
					members: [member({ id: 1 })],
				},
				groupBravo: {
					id: BRAVO_ID,
					team: null,
					members: [member({ id: 2 })],
				},
			}),
			[],
		);

		expect(result[0].weapons).toBeUndefined();
	});

	test("includes weapons when at least one player reported", () => {
		const result = resolveTimelineMaps(
			matchWith({
				mapList: [{ id: 1, stageId: 1, mode: "SZ", winnerGroupId: ALPHA_ID }],
				groupAlpha: {
					id: ALPHA_ID,
					team: null,
					members: [member({ id: 1 })],
				},
				groupBravo: {
					id: BRAVO_ID,
					team: null,
					members: [member({ id: 2 })],
				},
			}),
			[{ mapIndex: 0, userId: 1, weaponSplId: 40 }] as never,
		);

		expect(result[0].weapons).toEqual({
			alpha: [40],
			bravo: [null],
		});
	});
});

describe("resolveTimelineSpChanges()", () => {
	test("returns undefined when nobody has a skill difference", () => {
		const result = resolveTimelineSpChanges(
			matchWith({
				groupAlpha: {
					id: ALPHA_ID,
					team: null,
					members: [member({ id: 1 })],
					skillDifference: undefined,
				},
				groupBravo: {
					id: BRAVO_ID,
					team: null,
					members: [member({ id: 2 })],
					skillDifference: undefined,
				},
			}),
		);

		expect(result).toBeUndefined();
	});

	test("collects only members that actually have a skill difference", () => {
		const result = resolveTimelineSpChanges(
			matchWith({
				groupAlpha: {
					id: ALPHA_ID,
					team: null,
					members: [
						member({ id: 1, skillDifference: { spDiff: 5 } }),
						member({ id: 2 }),
					],
				},
				groupBravo: {
					id: BRAVO_ID,
					team: null,
					members: [member({ id: 3 })],
				},
			}),
		);

		expect(result?.alpha.members).toHaveLength(1);
		expect(result?.alpha.members[0].user.id).toBe(1);
		expect(result?.bravo.members).toHaveLength(0);
	});

	test("returns data when only the group itself has a skill difference", () => {
		const result = resolveTimelineSpChanges(
			matchWith({
				groupAlpha: {
					id: ALPHA_ID,
					team: null,
					members: [member({ id: 1 })],
					skillDifference: { calculated: true },
				},
				groupBravo: {
					id: BRAVO_ID,
					team: null,
					members: [member({ id: 2 })],
				},
			}),
		);

		expect(result?.alpha.skillDifference).toEqual({ calculated: true });
	});
});

describe("resolveMatchScore()", () => {
	test("counts wins per side and ignores unreported maps", () => {
		const result = resolveMatchScore(
			matchWith({
				mapList: [
					{ winnerGroupId: ALPHA_ID },
					{ winnerGroupId: ALPHA_ID },
					{ winnerGroupId: BRAVO_ID },
					{ winnerGroupId: null },
				],
			}),
		);

		expect(result).toEqual({ alpha: 2, bravo: 1 });
	});
});
