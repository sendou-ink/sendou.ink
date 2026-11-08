import * as R from "remeda";
import { describe, expect, test } from "vitest";
import * as Engine from "~/features/tournament-bracket/core/engine";
import type { BracketData } from "~/features/tournament-bracket/core/engine/types";
import * as TeamSpotlight from "./TeamSpotlight";

describe("TeamSpotlight.build", () => {
	test("lists the sets played in order, then the next one with its opponent to be decided", () => {
		const data = doubleElimination(4);
		const [firstMatchId] = firstRoundIds(data);
		const winnerId = teamIdsOf(data, firstMatchId)[0]!;

		const spotlight = build({
			data: report(data, firstMatchId, "opponent1"),
			teamId: winnerId,
			games: [
				game(firstMatchId, winnerId, "SZ"),
				game(firstMatchId, winnerId, "TC"),
			],
		});

		expect(spotlight.sets.map((set) => set.status)).toEqual([
			"win",
			"upcoming",
		]);
		expect(spotlight.sets[1].opponent).toBeNull();
		expect(spotlight.record).toEqual({
			setWins: 1,
			setLosses: 0,
			mapWins: 2,
			mapLosses: 0,
		});
		expect(spotlight.modes).toEqual([
			{ mode: "SZ", wins: 1, losses: 0 },
			{ mode: "TC", wins: 1, losses: 0 },
		]);
	});

	test("follows a team dropping to the losers bracket", () => {
		const data = doubleElimination(4);
		const [firstMatchId, secondMatchId] = firstRoundIds(data);
		const loserId = teamIdsOf(data, firstMatchId)[1]!;

		const spotlight = build({
			data: report(
				report(data, firstMatchId, "opponent1"),
				secondMatchId,
				"opponent1",
			),
			teamId: loserId,
		});

		expect(spotlight.sets.map((set) => set.status)).toEqual([
			"loss",
			"upcoming",
		]);
		expect(spotlight.sets[1].opponent?.id).toBe(
			teamIdsOf(data, secondMatchId)[1],
		);
		expect(spotlight.record).toMatchObject({ setWins: 0, setLosses: 1 });
	});

	test("shows the featured match only as far as the view has it", () => {
		const data = doubleElimination(4);
		const [featuredMatchId] = firstRoundIds(data);
		const winnerId = teamIdsOf(data, featuredMatchId)[0]!;

		const spotlight = build({
			data: report(data, featuredMatchId, "opponent1"),
			teamId: winnerId,
			games: [
				game(featuredMatchId, winnerId, "SZ"),
				game(featuredMatchId, winnerId, "TC"),
			],
			featured: {
				id: featuredMatchId,
				progress: { resultCount: 1, scores: [1, 0], isOver: false },
			},
		});

		expect(spotlight.sets).toHaveLength(1);
		expect(spotlight.sets[0]).toMatchObject({
			status: "live",
			scores: [1, 0],
			games: [{ mode: "SZ", isWin: true }],
		});
		expect(spotlight.record).toMatchObject({ setWins: 0, mapWins: 1 });
	});

	test("keeps a round robin team's later sets while the featured match's result isn't on air", () => {
		const data = Engine.create({
			type: "round_robin",
			seeding: R.range(1, 5),
			settings: { teamsPerGroup: 4 },
		});
		const teamId = 1;
		const featuredMatchId = data.match.find(
			(match) =>
				match.opponent1?.id === teamId || match.opponent2?.id === teamId,
		)!.id;

		const spotlight = build({
			data: report(data, featuredMatchId, "opponent1"),
			teamId,
			featured: {
				id: featuredMatchId,
				progress: { resultCount: 1, scores: [1, 0], isOver: false },
			},
		});

		expect(spotlight.sets.map((set) => set.status)).toEqual([
			"live",
			"upcoming",
		]);
		expect(spotlight.sets[1].opponent).not.toBeNull();
	});

	test("lists nothing for a team without sets", () => {
		const data = doubleElimination(3);

		const spotlight = build({ data, teamId: 99 });

		expect(spotlight.sets).toEqual([]);
		expect(spotlight.modes).toEqual([]);
	});
});

function build({
	data,
	teamId,
	games = [],
	featured = null,
}: {
	data: BracketData;
	teamId: number;
	games?: Parameters<typeof TeamSpotlight.build>[0]["games"];
	featured?: Parameters<typeof TeamSpotlight.build>[0]["featured"];
}) {
	return TeamSpotlight.build({
		teamId,
		brackets: [{ data }],
		games,
		featured,
		teamById: (id) => ({ id, name: `Team ${id}`, logoUrl: null, seed: id }),
		roundLabelOf: (matchId) => `Round of match ${matchId}`,
	});
}

function game(
	matchId: number,
	winnerTeamId: number,
	mode: "SZ" | "TC" | "RM" | "CB",
) {
	return { matchId, winnerTeamId, mode, stageId: 1 as const };
}

function doubleElimination(teamCount: number) {
	return Engine.create({
		type: "double_elimination",
		seeding: R.range(1, teamCount + 1),
		settings: {},
	});
}

function firstRoundIds(data: BracketData) {
	const firstRound = data.round.find(
		(round) => round.section === "winners" && round.number === 1,
	);

	return data.match
		.filter(
			(match) =>
				match.roundId === firstRound?.id && match.opponent1 && match.opponent2,
		)
		.map((match) => match.id);
}

function report(
	data: BracketData,
	matchId: number,
	winnerSide: "opponent1" | "opponent2",
) {
	return Engine.reportResult(data, {
		matchId,
		scores: winnerSide === "opponent1" ? [2, 0] : [0, 2],
		winnerSide,
	}).data;
}

function teamIdsOf(data: BracketData, matchId: number) {
	const match = data.match.find((candidate) => candidate.id === matchId);

	return [match?.opponent1?.id, match?.opponent2?.id];
}
