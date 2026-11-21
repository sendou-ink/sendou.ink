import { describe, expect, test } from "vitest";
import * as Engine from "~/features/tournament-bracket/core/engine";
import type { BracketData } from "~/features/tournament-bracket/core/engine/types";
import {
	matchesOfRound,
	reportWinner,
	teamIds,
} from "~/features/tournament-bracket/core/tests/bracket-fixtures";
import { testTournament } from "~/features/tournament-bracket/core/tests/test-utils";
import * as StationAutoAssignment from "./StationAutoAssignment";

const STATIONS = [101, 102, 103, 104];

const tournamentOf = (
	data: BracketData,
	type: "single_elimination" | "double_elimination" | "round_robin",
) =>
	testTournament({
		data,
		ctx: {
			settings: {
				bracketProgression: [
					{
						name: "Main Bracket",
						type,
						requiresCheckIn: false,
						settings: {},
					},
				],
			},
		},
	});

const singleElimination = () =>
	Engine.create({
		type: "single_elimination",
		seeding: teamIds(8),
		settings: null,
	});

const doubleElimination = () =>
	Engine.create({
		type: "double_elimination",
		seeding: teamIds(8),
		settings: null,
	});

const firstRoundIds = (data: BracketData) =>
	matchesOfRound(data, "winners", 1).map((match) => match.id);

const assignments = ({
	data,
	type = "single_elimination",
	stationIds = STATIONS,
	placedMatches = [],
}: {
	data: BracketData;
	type?: Parameters<typeof tournamentOf>[1];
	stationIds?: number[];
	placedMatches?: Array<{ matchId: number; stationId: number | null }>;
}) =>
	StationAutoAssignment.assignments({
		tournament: tournamentOf(data, type),
		stationIds,
		placedMatches,
	});

describe("StationAutoAssignment.assignments", () => {
	test("fills the free stations in their order with matches in play order", () => {
		const data = singleElimination();
		const [first, second, third] = firstRoundIds(data);

		expect(assignments({ data, stationIds: [101, 102, 103] })).toEqual([
			{ matchId: first, stationId: 101 },
			{ matchId: second, stationId: 102 },
			{ matchId: third, stationId: 103 },
		]);
	});

	test("assigns nothing without stations", () => {
		expect(assignments({ data: singleElimination(), stationIds: [] })).toEqual(
			[],
		);
	});

	test("puts one match at a time on a lone station", () => {
		const data = singleElimination();
		const [first, second] = firstRoundIds(data);

		expect(assignments({ data, stationIds: [101] })).toEqual([
			{ matchId: first, stationId: 101 },
		]);
		expect(
			assignments({
				data: reportWinner(data, first, "opponent1"),
				stationIds: [101],
				placedMatches: [{ matchId: first, stationId: 101 }],
			}),
		).toEqual([{ matchId: second, stationId: 101 }]);
	});

	test("leaves stations with an unfinished match queued alone and never moves placed matches", () => {
		const data = singleElimination();
		const [first, second, third, fourth] = firstRoundIds(data);

		expect(
			assignments({
				data,
				placedMatches: [
					{ matchId: first, stationId: 102 },
					{ matchId: second, stationId: null },
				],
			}),
		).toEqual([
			{ matchId: third, stationId: 101 },
			{ matchId: fourth, stationId: 103 },
		]);
	});

	test("takes a station whose queued match can't be played yet", () => {
		const data = singleElimination();
		const [first] = firstRoundIds(data);
		const final = data.match.at(-1)!;

		expect(
			assignments({
				data,
				stationIds: [101],
				placedMatches: [{ matchId: final.id, stationId: 101 }],
			}),
		).toEqual([{ matchId: first, stationId: 101 }]);
	});

	test("lets a later round wait while earlier round matches wait for a station", () => {
		let data = doubleElimination();
		const [first, second, third] = firstRoundIds(data);
		data = reportWinner(data, first, "opponent1");
		data = reportWinner(data, second, "opponent1");

		expect(
			assignments({
				data,
				type: "double_elimination",
				stationIds: [101],
				placedMatches: [
					{ matchId: first, stationId: 101 },
					{ matchId: second, stationId: 101 },
				],
			}),
		).toEqual([{ matchId: third, stationId: 101 }]);
	});

	test("keeps a team at the station it just played on", () => {
		let data = singleElimination();
		const [first, second, third, fourth] = firstRoundIds(data);
		for (const matchId of [first, second, third, fourth]) {
			data = reportWinner(data, matchId, "opponent1");
		}
		const [semifinalOne, semifinalTwo] = matchesOfRound(data, "winners", 2).map(
			(match) => match.id,
		);

		expect(
			assignments({
				data,
				placedMatches: [
					{ matchId: first, stationId: 101 },
					{ matchId: second, stationId: 102 },
					{ matchId: third, stationId: 103 },
					{ matchId: fourth, stationId: 104 },
				],
			}),
		).toEqual([
			{ matchId: semifinalOne, stationId: 101 },
			{ matchId: semifinalTwo, stationId: 103 },
		]);
	});

	test.each([
		{
			why: "the team with more games played keeps its station",
			secondScores: [2, 1] as [number, number],
			firstRoundStationIds: [102, 103, 101, 104],
			expected: [103, 101],
		},
		{
			why: "the station higher on the list is kept when both played as many games",
			secondScores: [2, 0] as [number, number],
			firstRoundStationIds: [103, 102, 101, 104],
			expected: [102, 101],
		},
	])(
		"when both teams' stations are free $why",
		({ secondScores, firstRoundStationIds, expected }) => {
			let data = singleElimination();
			const firstRound = firstRoundIds(data);
			for (const [idx, matchId] of firstRound.entries()) {
				data = Engine.reportResult(data, {
					matchId,
					scores: idx === 1 ? secondScores : [2, 0],
					winnerSide: "opponent1",
				}).data;
			}
			const semifinalIds = matchesOfRound(data, "winners", 2).map(
				(match) => match.id,
			);

			expect(
				assignments({
					data,
					placedMatches: firstRound.map((matchId, idx) => ({
						matchId,
						stationId: firstRoundStationIds[idx],
					})),
				}),
			).toEqual(
				semifinalIds.map((matchId, idx) => ({
					matchId,
					stationId: expected[idx],
				})),
			);
		},
	);

	test("skips a match whose team is busy on another station", () => {
		const data = Engine.create({
			type: "round_robin",
			seeding: teamIds(4),
			settings: null,
			independentRounds: true,
		});
		const roundOne = data.match.filter(
			(match) =>
				data.round.find((round) => round.id === match.roundId)?.number === 1,
		);

		expect(
			assignments({ data, type: "round_robin", stationIds: [101, 102, 103] }),
		).toEqual(
			roundOne.map((match, idx) => ({
				matchId: match.id,
				stationId: [101, 102][idx],
			})),
		);
	});
});
