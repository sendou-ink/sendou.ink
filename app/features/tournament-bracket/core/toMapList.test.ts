import { describe, expect, test } from "vitest";
import type { Tables } from "~/db/tables";
import { SENDOUQ_MAP_POOL } from "~/features/match-profile/banned-maps";
import { rankedModesShort } from "~/modules/in-game-lists/modes";
import type { ModeShort } from "~/modules/in-game-lists/types";
import type { RoundData } from "./engine/types";
import {
	type BracketMapCounts,
	type GenerateTournamentRoundMaplistArgs,
	generateTournamentRoundMaplist,
	roundSetKey,
} from "./toMapList";

const MAPS_PER_ROUND = 3;

const rankedPool = SENDOUQ_MAP_POOL.stageModePairs.filter(
	(pair) => pair.mode !== "TW",
);

/** Rounds of the given groups, ids running from 1 in group order. */
const roundsOf = (
	groups: Array<{
		groupId: number;
		roundCount: number;
		section?: RoundData["section"];
	}>,
): RoundData[] => {
	const rounds: RoundData[] = [];
	for (const { groupId, roundCount, section = null } of groups) {
		for (let number = 1; number <= roundCount; number++) {
			rounds.push({
				id: rounds.length + 1,
				stageId: 1,
				groupId,
				section,
				number,
			});
		}
	}

	return rounds;
};

const mapCountsOf = (rounds: RoundData[]): BracketMapCounts => {
	const counts: BracketMapCounts = new Map();
	for (const round of rounds) {
		const roundSet = counts.get(roundSetKey(round)) ?? new Map();
		roundSet.set(round.number, { count: MAPS_PER_ROUND, type: "BEST_OF" });
		counts.set(roundSetKey(round), roundSet);
	}

	return counts;
};

const singleGroupRounds = roundsOf([
	{ groupId: 0, roundCount: 3, section: "winners" },
]);

const generate = (
	overrides: Partial<GenerateTournamentRoundMaplistArgs> & {
		rounds?: RoundData[];
		type?: Tables["TournamentStage"]["type"];
	} = {},
) => {
	const rounds = overrides.rounds ?? singleGroupRounds;

	return generateTournamentRoundMaplist({
		pool: rankedPool,
		teamsPickMaps: true,
		rounds,
		mapCounts: mapCountsOf(rounds),
		type: "single_elimination",
		roundsWithPickBan: new Set(),
		pickBanStyle: null,
		patterns: new Map(),
		countType: "BEST_OF",
		...overrides,
	});
};

const modesOf = (result: ReturnType<typeof generate>) =>
	Array.from(result.values()).map((round) => round.modes ?? []);

describe("generateTournamentRoundMaplist", () => {
	test("team picked rounds get a mode order instead of a map list", () => {
		const result = generate();

		expect(result.size).toBe(singleGroupRounds.length);
		for (const round of result.values()) {
			expect(round.list).toBeNull();
			expect(round.count).toBe(MAPS_PER_ROUND);
			expect(round.modes).toHaveLength(MAPS_PER_ROUND);
			for (const mode of round.modes ?? []) {
				expect(rankedModesShort).toContain(mode);
			}
		}
	});

	test("successive team picked rounds continue the mode rotation instead of restarting it", () => {
		const modes = modesOf(generate()).flat();
		const cycle = modes.slice(0, rankedModesShort.length);

		expect(new Set(cycle).size).toBe(rankedModesShort.length);
		for (const [i, mode] of modes.entries()) {
			expect(mode).toBe(cycle[i % cycle.length]);
		}
	});

	test("a mode pattern fixes the modes of every team picked round", () => {
		const [first, second, third] = modesOf(
			generate({ patterns: new Map([[MAPS_PER_ROUND, "SZ*TC"]]) }),
		);

		for (const modes of [first, second, third]) {
			expect(modes[0]).toBe("SZ");
			expect(modes[2]).toBe("TC");
			expect(["RM", "CB"]).toContain(modes[1]);
		}
		// the wildcard slot keeps rotating through the modes the pattern leaves free
		expect(second[1]).not.toBe(first[1]);
		expect(third[1]).toBe(first[1]);
	});

	test("a BAN_2 round gets two more modes than its map count", () => {
		const result = generate({
			roundsWithPickBan: new Set([singleGroupRounds[0].id]),
			pickBanStyle: "BAN_2",
		});

		expect(result.get(singleGroupRounds[0].id)).toMatchObject({
			count: MAPS_PER_ROUND,
			pickBan: "BAN_2",
		});
		expect(result.get(singleGroupRounds[0].id)?.modes).toHaveLength(
			MAPS_PER_ROUND + 2,
		);
		expect(result.get(singleGroupRounds[1].id)?.pickBan).toBeUndefined();
		expect(result.get(singleGroupRounds[1].id)?.modes).toHaveLength(
			MAPS_PER_ROUND,
		);
	});

	test.each([
		{ pickBanStyle: "COUNTERPICK", expectedModes: 1 },
		{ pickBanStyle: "COUNTERPICK_MODE_REPEAT_OK", expectedModes: 1 },
	] as const)(
		"a $pickBanStyle round gets only its starting mode",
		({ pickBanStyle, expectedModes }) => {
			const result = generate({
				roundsWithPickBan: new Set([singleGroupRounds[0].id]),
				pickBanStyle,
			});

			expect(result.get(singleGroupRounds[0].id)?.modes).toHaveLength(
				expectedModes,
			);
		},
	);

	test("organizer picked rounds get a map list from the pool and no mode order", () => {
		const result = generate({ teamsPickMaps: false });

		for (const round of result.values()) {
			expect(round.modes).toBeUndefined();
			expect(round.list).toHaveLength(MAPS_PER_ROUND);
			for (const map of round.list ?? []) {
				expect(rankedPool).toContainEqual(map);
			}
		}
	});

	test("round robin groups share the map list of the group with the most rounds", () => {
		const rounds = roundsOf([
			{ groupId: 0, roundCount: 2 },
			{ groupId: 1, roundCount: 3 },
		]);

		const result = generate({ rounds, type: "round_robin" });

		expect(Array.from(result.keys())).toEqual(
			rounds.filter((round) => round.groupId === 1).map((round) => round.id),
		);
	});

	test("mode order only contains modes of the pool", () => {
		const pool = rankedPool.filter((pair) => pair.mode === "SZ");

		const modes = modesOf(generate({ pool })).flat();

		expect(modes).toHaveLength(singleGroupRounds.length * MAPS_PER_ROUND);
		expect(modes.every((mode: ModeShort) => mode === "SZ")).toBe(true);
	});
});
