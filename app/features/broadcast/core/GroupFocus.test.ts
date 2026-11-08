import * as R from "remeda";
import { describe, expect, test } from "vitest";
import * as Engine from "~/features/tournament-bracket/core/engine";
import type { BracketData } from "~/features/tournament-bracket/core/engine/types";
import type { BroadcastSwissBracket } from "../broadcast-types";
import * as GroupFocus from "./GroupFocus";

describe("GroupFocus.windowsAround", () => {
	test.each([
		{ why: "fits whole", count: 4, focused: [3], expected: [[0, 4]] },
		{ why: "nothing focused", count: 10, focused: [], expected: [[0, 4]] },
		{ why: "centered", count: 10, focused: [4, 5], expected: [[3, 7]] },
		{ why: "clamped to the end", count: 10, focused: [9], expected: [[6, 10]] },
		{
			why: "clamped to the start",
			count: 10,
			focused: [0],
			expected: [[0, 4]],
		},
		{
			why: "split when far apart",
			count: 20,
			focused: [2, 15],
			expected: [
				[2, 4],
				[15, 17],
			],
		},
	])("$why", ({ count, focused, expected }) => {
		expect(
			GroupFocus.windowsAround({ count, focusedIdxs: focused, size: 4 }),
		).toEqual(expected);
	});
});

describe("GroupFocus.roundRobin", () => {
	test("lays out every round of the group with byes left out", () => {
		const group = GroupFocus.roundRobin(
			groupArgs({ data: roundRobin({ teamCount: 5 }) }),
		);

		expect(group.rounds.map((round) => round.number)).toEqual([1, 2, 3, 4, 5]);
		expect(group.rounds.map((round) => round.matches.length)).toEqual([
			2, 2, 2, 2, 2,
		]);
	});

	test("shows a big group's rounds around the featured match's", () => {
		const data = roundRobin({ teamCount: 10 });
		const lastRound = R.firstBy(data.round, [(round) => round.number, "desc"]);
		const featuredMatchId = data.match.find(
			(match) => match.roundId === lastRound?.id,
		)?.id;

		const group = GroupFocus.roundRobin(
			groupArgs({ data, featuredMatchId: featuredMatchId ?? null }),
		);

		expect(group.rounds.map((round) => round.number)).toEqual([
			3, 4, 5, 6, 7, 8, 9,
		]);
		expect(
			group.rounds.at(-1)?.matches.find((match) => match.isFeatured)?.id,
		).toBe(featuredMatchId);
	});

	test("shows a big group's standings around the featured match's teams", () => {
		const data = roundRobin({ teamCount: 20 });
		const featuredMatch = data.match.find((match) =>
			R.isDeepEqual(
				[match.opponent1?.id, match.opponent2?.id].sort((a, b) => a! - b!),
				[19, 20],
			),
		);

		const group = GroupFocus.roundRobin(
			groupArgs({ data, featuredMatchId: featuredMatch?.id ?? null }),
		);

		expect(group.standings).toHaveLength(1);
		expect(group.standings[0].hiddenAbove).toBe(4);
		expect(group.standings[0].standings).toHaveLength(16);
		expect(group.standingsHiddenBelow).toBe(0);
	});

	test("shows the standings around both teams of the featured match when far apart", () => {
		const data = roundRobin({ teamCount: 40 });
		const featuredMatch = data.match.find((match) =>
			R.isDeepEqual(
				[match.opponent1?.id, match.opponent2?.id].sort((a, b) => a! - b!),
				[1, 40],
			),
		);

		const group = GroupFocus.roundRobin(
			groupArgs({ data, featuredMatchId: featuredMatch?.id ?? null }),
		);

		expect(
			group.standings.map((run) => [
				run.hiddenAbove,
				run.standings[0].placement,
				run.standings.at(-1)?.placement,
			]),
		).toEqual([
			[0, 1, 8],
			[24, 33, 40],
		]);
		expect(group.standingsHiddenBelow).toBe(0);
	});

	test("numbers the placements within the group", () => {
		const data = roundRobin({ teamCount: 3 });

		const group = GroupFocus.roundRobin({
			...groupArgs({ data }),
			standings: [
				{ team: { id: 1 }, placement: 1 },
				{ team: { id: 2 }, placement: 3 },
				{ team: { id: 3 }, placement: 3 },
			],
		});

		expect(
			group.standings[0].standings.map((standing) => standing.placement),
		).toEqual([1, 2, 2]);
	});
});

describe("GroupFocus.swiss", () => {
	test("pools the last round paired by the records its teams went into it with", () => {
		const group = GroupFocus.swiss(
			groupArgs({ data: swissAfterFirstRound({ teamCount: 8 }) }),
		);

		expect(group.roundNumber).toBe(2);
		expect(group.roundCount).toBe(3);
		expect(poolsOf(group)).toEqual([
			["1-0", 2],
			["0-1", 2],
		]);
	});

	test("counts a bye as a win", () => {
		const data = swissAfterFirstRound({ teamCount: 7 });
		const byeTeamId = data.match.find((match) => match.opponent2 === null)
			?.opponent1?.id;

		const group = GroupFocus.swiss(groupArgs({ data }));

		const byeTeamPool = group.pools.find((pool) =>
			pool.matches.some((match) =>
				match.teams.some((team) => team?.id === byeTeamId),
			),
		);
		expect(byeTeamPool).toMatchObject({ wins: 1, losses: 0 });
	});

	test("shows the featured match's round", () => {
		const data = swissAfterFirstRound({ teamCount: 8 });
		const featuredMatchId = data.match[0].id;

		const group = GroupFocus.swiss(groupArgs({ data, featuredMatchId }));

		expect(group.roundNumber).toBe(1);
		expect(poolsOf(group)).toEqual([["0-0", 4]]);
	});
});

function roundRobin({ teamCount }: { teamCount: number }) {
	return Engine.create({
		type: "round_robin",
		seeding: R.range(1, teamCount + 1),
		settings: { teamsPerGroup: teamCount },
	});
}

/** Round 1 won by the higher seeds, round 2 paired winners against winners and losers against losers. */
function swissAfterFirstRound({ teamCount }: { teamCount: number }) {
	let data = Engine.create({
		type: "swiss",
		seeding: R.range(1, teamCount + 1),
		settings: { groupCount: 1, roundCount: 3 },
	});
	for (const firstRoundMatch of data.match.filter((match) => match.opponent2)) {
		data = Engine.reportResult(data, {
			matchId: firstRoundMatch.id,
			scores: [2, 1],
			winnerSide: "opponent1",
		}).data;
	}

	const winnerIds = data.match.map((match) => match.opponent1?.id);
	const loserIds = data.match.flatMap((match) =>
		match.opponent2 ? [match.opponent2.id] : [],
	);
	const secondRound = data.round.find((round) => round.number === 2)!;
	const pairs = [...R.chunk(winnerIds, 2), ...R.chunk(loserIds, 2)].filter(
		(pair) => pair.length === 2,
	);

	return {
		...data,
		match: [
			...data.match,
			...pairs.map(([a, b], idx) => ({
				id: data.match.length + idx,
				groupId: secondRound.groupId,
				number: idx + 1,
				roundId: secondRound.id,
				stageId: secondRound.stageId,
				opponent1: { id: a ?? null },
				opponent2: { id: b ?? null },
			})),
		],
	} as BracketData;
}

function groupArgs({
	data,
	featuredMatchId = null,
}: {
	data: BracketData;
	featuredMatchId?: number | null;
}) {
	const teamIds = R.unique(
		data.match.flatMap((match) =>
			[match.opponent1?.id, match.opponent2?.id].filter(
				(id) => typeof id === "number",
			),
		),
	).sort((a, b) => a - b);

	return {
		idx: 0,
		name: "Groups",
		data,
		groupId: data.group[0].id,
		standings: teamIds.map((id, idx) => ({
			team: { id },
			placement: idx + 1,
		})),
		featuredMatchId,
		teamById: (id: number) => ({
			id,
			name: `Team ${id}`,
			logoUrl: null,
			seed: id,
		}),
	};
}

function poolsOf(group: BroadcastSwissBracket) {
	return group.pools.map((pool) => [
		`${pool.wins}-${pool.losses}`,
		pool.matches.length,
	]);
}
