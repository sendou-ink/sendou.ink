import { minutesToMilliseconds } from "date-fns";
import { describe, expect, test } from "vitest";
import type { TournamentRoundMaps } from "~/db/tables-json";
import * as Engine from "~/features/tournament-bracket/core/engine";
import type { BracketData } from "~/features/tournament-bracket/core/engine/types";
import {
	matchesOfRound,
	reportWinner,
	teamIds,
} from "~/features/tournament-bracket/core/tests/bracket-fixtures";
import {
	progressions,
	roundMaps,
	testTournament,
} from "~/features/tournament-bracket/core/tests/test-utils";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import * as EtaSimulation from "./EtaSimulation";

const NOW = Date.UTC(2026, 10, 14, 12);
const { MINUTES_PER_GAME, SETUP_MINUTES } = EtaSimulation.ETA_CONSTANTS;
const SETUP = minutesToMilliseconds(SETUP_MINUTES);

/** Milliseconds a set of the given games takes. */
const setOf = (games: number) =>
	minutesToMilliseconds(games * MINUTES_PER_GAME);
const BEST_OF_3 = { best: setOf(2), worst: setOf(3) };

const range = (earliest: number, latest = earliest) => ({
	earliest: NOW + earliest,
	latest: NOW + latest,
});

const singleElimination = (teamCount = 8) =>
	Engine.create({
		type: "single_elimination",
		seeding: teamIds(teamCount),
		settings: null,
	});

const firstRoundIds = (data: BracketData) =>
	matchesOfRound(data, "winners", 1).map((match) => match.id);

const finalId = (data: BracketData) => matchesOfRound(data, "winners", 2)[0].id;

const simulate = ({
	data,
	type = "single_elimination",
	stationIds = [],
	placements = [],
}: {
	data: BracketData;
	type?: "single_elimination" | "round_robin";
	stationIds?: number[];
	placements?: Array<{ matchId: number; stationId: number | null }>;
}) =>
	EtaSimulation.simulate({
		tournament: testTournament({
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
		}),
		stationIds,
		placements,
		now: NOW,
	});

const withRoundMaps = (
	data: BracketData,
	maps: TournamentRoundMaps,
): BracketData => ({
	...data,
	round: data.round.map((round) => ({ ...round, maps })),
});

describe("EtaSimulation.simulate", () => {
	test("without stations starts each match once the matches feeding it have ended", () => {
		const data = singleElimination(4);
		const [first, second] = firstRoundIds(data);
		const final = finalId(data);

		const { matchStarts } = simulate({ data });

		expect(matchStarts.get(first)).toEqual(range(0));
		expect(matchStarts.get(second)).toEqual(range(0));
		expect(matchStarts.get(final)).toEqual(
			range(BEST_OF_3.best, BEST_OF_3.worst),
		);
	});

	test("plays one match at a time on a lone station, with setup time before each match on no station it takes", () => {
		const data = singleElimination(4);
		const [first, second] = firstRoundIds(data);
		const final = finalId(data);

		const { matchStarts } = simulate({ data, stationIds: [101] });

		expect(matchStarts.get(first)).toEqual(range(0));
		expect(matchStarts.get(second)).toEqual(
			range(BEST_OF_3.best + SETUP, BEST_OF_3.worst + SETUP),
		);
		expect(matchStarts.get(final)).toEqual(
			range(2 * (BEST_OF_3.best + SETUP), 2 * (BEST_OF_3.worst + SETUP)),
		);
	});

	test("gives no setup time to the match queued after the one played now, but to the ones after it", () => {
		const data = singleElimination(4);
		const [first, second] = firstRoundIds(data);
		const final = finalId(data);

		const { matchStarts } = simulate({
			data,
			stationIds: [101],
			placements: [first, second, final].map((matchId) => ({
				matchId,
				stationId: 101,
			})),
		});

		expect(matchStarts.get(second)).toEqual(
			range(BEST_OF_3.best, BEST_OF_3.worst),
		);
		expect(matchStarts.get(final)).toEqual(
			range(2 * BEST_OF_3.best + SETUP, 2 * BEST_OF_3.worst + SETUP),
		);
	});

	test("plays as many matches at once as there are stations, in play order", () => {
		const data = singleElimination();
		const [first, second, third, fourth] = firstRoundIds(data);

		const { matchStarts } = simulate({ data, stationIds: [101, 102] });

		expect(
			[first, second, third, fourth].map((id) => matchStarts.get(id)),
		).toEqual([
			range(0),
			range(0),
			range(BEST_OF_3.best + SETUP, BEST_OF_3.worst + SETUP),
			range(BEST_OF_3.best + SETUP, BEST_OF_3.worst + SETUP),
		]);
	});

	test("follows a station's queue before matches on no station", () => {
		const data = singleElimination(4);
		const [first, second] = firstRoundIds(data);

		const { matchStarts } = simulate({
			data,
			stationIds: [101],
			placements: [{ matchId: second, stationId: 101 }],
		});

		expect(matchStarts.get(second)).toEqual(range(0));
		expect(matchStarts.get(first)).toEqual(
			range(BEST_OF_3.best + SETUP, BEST_OF_3.worst + SETUP),
		);
	});

	test("plays only a station's own queued matches on it", () => {
		const data = singleElimination(4);
		const [first, second] = firstRoundIds(data);

		const { matchStarts } = simulate({
			data,
			stationIds: [101, 102],
			placements: [
				{ matchId: first, stationId: 101 },
				{ matchId: second, stationId: 101 },
			],
		});

		expect(matchStarts.get(second)).toEqual(
			range(BEST_OF_3.best, BEST_OF_3.worst),
		);
	});

	test("skips a queued match that can't be played yet", () => {
		const data = singleElimination(4);
		const [first, second] = firstRoundIds(data);
		const final = finalId(data);

		const { matchStarts } = simulate({
			data,
			stationIds: [101],
			placements: [
				{ matchId: final, stationId: 101 },
				{ matchId: first, stationId: 101 },
			],
		});

		expect(matchStarts.get(first)).toEqual(range(0));
		expect(matchStarts.get(second)).toEqual(
			range(BEST_OF_3.best + SETUP, BEST_OF_3.worst + SETUP),
		);
		expect(matchStarts.get(final)).toEqual(
			range(2 * (BEST_OF_3.best + SETUP), 2 * (BEST_OF_3.worst + SETUP)),
		);
	});

	test("gives a station idle now setup time before the first match it gets later", () => {
		const data = singleElimination(4);
		const [first, second] = firstRoundIds(data);
		const final = finalId(data);

		const { matchStarts } = simulate({
			data,
			stationIds: [101, 102, 103],
			placements: [
				{ matchId: first, stationId: 101 },
				{ matchId: second, stationId: 102 },
				{ matchId: final, stationId: 103 },
			],
		});

		expect(matchStarts.get(final)).toEqual(
			range(BEST_OF_3.best + SETUP, BEST_OF_3.worst + SETUP),
		);
	});

	test("plays a match kept in Waiting by hand like one on no station", () => {
		const data = singleElimination(4);
		const [first, second] = firstRoundIds(data);

		const { matchStarts } = simulate({
			data,
			stationIds: [101],
			placements: [{ matchId: first, stationId: null }],
		});

		expect(matchStarts.get(first)).toEqual(range(0));
		expect(matchStarts.get(second)).toEqual(
			range(BEST_OF_3.best + SETUP, BEST_OF_3.worst + SETUP),
		);
	});

	test("counts only the games a set underway has left", () => {
		let data = singleElimination(4);
		const [first, second] = firstRoundIds(data);
		data = Engine.reportResult(data, {
			matchId: first,
			scores: [1, 0],
		}).data;

		const { matchStarts } = simulate({
			data,
			stationIds: [101],
			placements: [{ matchId: first, stationId: 101 }],
		});

		expect(matchStarts.get(second)).toEqual(
			range(setOf(1) + SETUP, setOf(2) + SETUP),
		);
	});

	test("estimates nothing for finished matches", () => {
		const data = singleElimination(4);
		const [first] = firstRoundIds(data);

		const { matchStarts } = simulate({
			data: reportWinner(data, first, "opponent1"),
		});

		expect(matchStarts.has(first)).toBe(false);
	});

	test.each([
		{
			why: "play all plays every game",
			maps: roundMaps.playAll3,
			expected: { best: setOf(3), worst: setOf(3) },
		},
		{
			why: "best of 5 ends after 3 to 5 games",
			maps: roundMaps.bestOf5Counterpick,
			expected: { best: setOf(3), worst: setOf(5) },
		},
	])(
		"takes the set length from the round's maps: $why",
		({ maps, expected }) => {
			const data = withRoundMaps(singleElimination(4), maps);
			const final = finalId(data);

			const { matchStarts } = simulate({ data });

			expect(matchStarts.get(final)).toEqual(
				range(expected.best, expected.worst),
			);
		},
	);

	test("lets a team's next match wait for its previous one even with stations free", () => {
		const data = Engine.create({
			type: "round_robin",
			seeding: teamIds(4),
			settings: null,
		});
		const teamOneMatches = data.match.filter(
			(match) => match.opponent1?.id === 1 || match.opponent2?.id === 1,
		);

		const { matchStarts } = simulate({
			data,
			type: "round_robin",
			stationIds: [101, 102, 103],
		});

		expect(teamOneMatches.map((match) => matchStarts.get(match.id))).toEqual([
			range(0),
			range(BEST_OF_3.best + SETUP, BEST_OF_3.worst + SETUP),
			range(2 * (BEST_OF_3.best + SETUP), 2 * (BEST_OF_3.worst + SETUP)),
		]);
	});
});

describe("EtaSimulation.simulate bracketStarts", () => {
	const groups = () =>
		Engine.create({
			type: "round_robin",
			seeding: teamIds(4),
			settings: null,
		});

	const topCutStartsIn = (data: BracketData, startTime: number | null) =>
		EtaSimulation.simulate({
			tournament: testTournament({
				data,
				ctx: {
					settings: {
						bracketProgression: [
							progressions.roundRobinToSingleElimination[0],
							{
								...progressions.roundRobinToSingleElimination[1],
								startTime: startTime ?? undefined,
							},
						],
					},
				},
			}),
			stationIds: [],
			placements: [],
			now: NOW,
		}).bracketStarts.get(1);

	test("starts a bracket yet to start once its source bracket ends", () => {
		const startTime = dateToDatabaseTimestamp(new Date(NOW));

		// three rounds of best of 3
		expect(topCutStartsIn(groups(), startTime)).toEqual(
			range(3 * BEST_OF_3.best, 3 * BEST_OF_3.worst),
		);
	});

	test("starts a bracket yet to start at its start time when its source bracket ends before", () => {
		const startsAt = NOW + minutesToMilliseconds(120);

		expect(
			topCutStartsIn(groups(), dateToDatabaseTimestamp(new Date(startsAt))),
		).toEqual(range(minutesToMilliseconds(120)));
	});

	test("estimates no start for a bracket yet to start without a start time", () => {
		expect(topCutStartsIn(groups(), null)).toBeUndefined();
	});

	test("estimates no start for a bracket whose source bracket hasn't started", () => {
		const startTime = dateToDatabaseTimestamp(new Date(NOW));
		const [groupsStage, topCut] = progressions.roundRobinToSingleElimination;

		const { bracketStarts } = EtaSimulation.simulate({
			tournament: testTournament({
				data: groups(),
				ctx: {
					settings: {
						bracketProgression: [
							groupsStage,
							{ ...topCut, startTime },
							{
								...topCut,
								name: "B2",
								startTime,
								sources: [{ bracketIdx: 1, placements: [1, 2] }],
							},
						],
					},
				},
			}),
			stationIds: [],
			placements: [],
			now: NOW,
		});

		expect(bracketStarts.has(1)).toBe(true);
		expect(bracketStarts.has(2)).toBe(false);
	});
});

describe("EtaSimulation.minutesFromNow", () => {
	test.each([
		{ why: "due now", earliest: 0, latest: 0, expected: { min: 0, max: 0 } },
		{
			why: "rounded to multiples of 5",
			earliest: 22,
			latest: 37,
			expected: { min: 20, max: 40 },
		},
		{
			why: "past times count as now",
			earliest: -10,
			latest: 3,
			expected: { min: 0, max: 5 },
		},
		{ why: "too far out", earliest: 60, latest: 200, expected: null },
	])("$why", ({ earliest, latest, expected }) => {
		expect(
			EtaSimulation.minutesFromNow(
				range(minutesToMilliseconds(earliest), minutesToMilliseconds(latest)),
				NOW,
			),
		).toEqual(expected);
	});
});
