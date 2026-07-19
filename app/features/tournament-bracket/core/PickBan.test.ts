import { describe, expect, it } from "vitest";
import type { TournamentRoundMaps } from "~/db/tables";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import {
	CUSTOM_FLOW_VALIDATION_ERRORS,
	currentTurnSessionStartedAt,
	isModeLegal,
	mapsListWithLegality,
	type PickBanEvent,
	type PickBanTeam,
	randomWhoTeamIndex,
	resolveCurrentStep,
	resolveTeamFromSide,
	teamOfEvent,
	turnOf,
	validateCustomFlowSection,
} from "./PickBan";

describe("validateCustomFlowSection", () => {
	it("returns no errors for valid preSet steps", () => {
		const steps = [
			{ action: "BAN" as const, side: "HIGHER_SEED" as const },
			{ action: "BAN" as const, side: "LOWER_SEED" as const },
			{ action: "PICK" as const, side: "HIGHER_SEED" as const },
		];

		expect(validateCustomFlowSection(steps, "preSet")).toEqual([]);
	});

	it("returns no errors for valid postGame steps", () => {
		const steps = [
			{ action: "BAN" as const, side: "WINNER" as const },
			{ action: "PICK" as const, side: "LOSER" as const },
		];

		expect(validateCustomFlowSection(steps, "postGame")).toEqual([]);
	});

	it("returns STEP_MISSING_ACTION when a step has no action", () => {
		const steps = [
			{ side: "ALPHA" as const },
			{ action: "PICK" as const, side: "ALPHA" as const },
		];

		expect(validateCustomFlowSection(steps, "preSet")).toContain(
			CUSTOM_FLOW_VALIDATION_ERRORS.STEP_MISSING_ACTION,
		);
	});

	it("returns STEP_MISSING_WHO when a non-ROLL step has no side", () => {
		const steps = [{ action: "BAN" as const }];

		expect(validateCustomFlowSection(steps, "preSet")).toContain(
			CUSTOM_FLOW_VALIDATION_ERRORS.STEP_MISSING_WHO,
		);
	});

	it("does not require side for ROLL steps", () => {
		const steps = [{ action: "ROLL" as const }];

		expect(validateCustomFlowSection(steps, "preSet")).toEqual([]);
	});

	it("returns LAST_STEP_MUST_BE_PICK_OR_ROLL when last step is BAN", () => {
		const steps = [
			{ action: "PICK" as const, side: "ALPHA" as const },
			{ action: "BAN" as const, side: "BRAVO" as const },
		];

		expect(validateCustomFlowSection(steps, "preSet")).toContain(
			CUSTOM_FLOW_VALIDATION_ERRORS.LAST_STEP_MUST_BE_PICK_OR_ROLL,
		);
	});

	it("accepts PICK_NO_MODE_REPEAT as the last (map picking) step", () => {
		const steps = [
			{ action: "BAN" as const, side: "HIGHER_SEED" as const },
			{ action: "PICK_NO_MODE_REPEAT" as const, side: "LOWER_SEED" as const },
		];

		expect(validateCustomFlowSection(steps, "postGame")).toEqual([]);
	});

	it("counts PICK_NO_MODE_REPEAT toward TOO_MANY_MAP_PICKS", () => {
		const steps = [
			{ action: "PICK" as const, side: "HIGHER_SEED" as const },
			{ action: "PICK_NO_MODE_REPEAT" as const, side: "LOWER_SEED" as const },
		];

		expect(validateCustomFlowSection(steps, "preSet")).toContain(
			CUSTOM_FLOW_VALIDATION_ERRORS.TOO_MANY_MAP_PICKS,
		);
	});

	it("returns SAME_TEAM_MODE_AND_MAP_PICK for PICK_NO_MODE_REPEAT by the mode picker", () => {
		const steps = [
			{ action: "MODE_PICK" as const, side: "HIGHER_SEED" as const },
			{ action: "PICK_NO_MODE_REPEAT" as const, side: "HIGHER_SEED" as const },
		];

		expect(validateCustomFlowSection(steps, "preSet")).toContain(
			CUSTOM_FLOW_VALIDATION_ERRORS.SAME_TEAM_MODE_AND_MAP_PICK,
		);
	});

	it("returns LAST_STEP_MUST_BE_PICK_OR_ROLL when last step is MODE_BAN", () => {
		const steps = [{ action: "MODE_BAN" as const, side: "ALPHA" as const }];

		expect(validateCustomFlowSection(steps, "preSet")).toContain(
			CUSTOM_FLOW_VALIDATION_ERRORS.LAST_STEP_MUST_BE_PICK_OR_ROLL,
		);
	});

	it("allows PICK as last step", () => {
		const steps = [{ action: "PICK" as const, side: "ALPHA" as const }];

		const errors = validateCustomFlowSection(steps, "preSet");

		expect(errors).not.toContain(
			CUSTOM_FLOW_VALIDATION_ERRORS.LAST_STEP_MUST_BE_PICK_OR_ROLL,
		);
	});

	it("allows ROLL as last step", () => {
		const steps = [{ action: "ROLL" as const }];

		const errors = validateCustomFlowSection(steps, "postGame");

		expect(errors).not.toContain(
			CUSTOM_FLOW_VALIDATION_ERRORS.LAST_STEP_MUST_BE_PICK_OR_ROLL,
		);
	});

	it("returns WINNER_LOSER_IN_PRE_SET when WINNER is used in preSet", () => {
		const steps = [{ action: "PICK" as const, side: "WINNER" as const }];

		expect(validateCustomFlowSection(steps, "preSet")).toContain(
			CUSTOM_FLOW_VALIDATION_ERRORS.WINNER_LOSER_IN_PRE_SET,
		);
	});

	it("returns WINNER_LOSER_IN_PRE_SET when LOSER is used in preSet", () => {
		const steps = [{ action: "PICK" as const, side: "LOSER" as const }];

		expect(validateCustomFlowSection(steps, "preSet")).toContain(
			CUSTOM_FLOW_VALIDATION_ERRORS.WINNER_LOSER_IN_PRE_SET,
		);
	});

	it("allows WINNER/LOSER in postGame", () => {
		const steps = [
			{ action: "BAN" as const, side: "WINNER" as const },
			{ action: "PICK" as const, side: "LOSER" as const },
		];

		expect(validateCustomFlowSection(steps, "postGame")).toEqual([]);
	});

	it("returns TOO_MANY_MODE_PICKS when more than one MODE_PICK", () => {
		const steps = [
			{ action: "MODE_PICK" as const, side: "ALPHA" as const },
			{ action: "MODE_PICK" as const, side: "BRAVO" as const },
			{ action: "PICK" as const, side: "ALPHA" as const },
		];

		expect(validateCustomFlowSection(steps, "preSet")).toContain(
			CUSTOM_FLOW_VALIDATION_ERRORS.TOO_MANY_MODE_PICKS,
		);
	});

	it("returns TOO_MANY_MAP_PICKS when section has PICK and ROLL", () => {
		const steps = [
			{ action: "BAN" as const, side: "ALPHA" as const },
			{ action: "PICK" as const, side: "BRAVO" as const },
			{ action: "ROLL" as const },
		];

		expect(validateCustomFlowSection(steps, "preSet")).toContain(
			CUSTOM_FLOW_VALIDATION_ERRORS.TOO_MANY_MAP_PICKS,
		);
	});

	it("returns TOO_MANY_MAP_PICKS when section has two ROLLs", () => {
		const steps = [{ action: "ROLL" as const }, { action: "ROLL" as const }];

		expect(validateCustomFlowSection(steps, "preSet")).toContain(
			CUSTOM_FLOW_VALIDATION_ERRORS.TOO_MANY_MAP_PICKS,
		);
	});

	it("returns TOO_MANY_MAP_PICKS when section has two PICKs", () => {
		const steps = [
			{ action: "PICK" as const, side: "ALPHA" as const },
			{ action: "MODE_BAN" as const, side: "BRAVO" as const },
			{ action: "PICK" as const, side: "BRAVO" as const },
		];

		expect(validateCustomFlowSection(steps, "preSet")).toContain(
			CUSTOM_FLOW_VALIDATION_ERRORS.TOO_MANY_MAP_PICKS,
		);
	});

	it("allows exactly one PICK or ROLL", () => {
		const stepsWithPick = [
			{ action: "BAN" as const, side: "ALPHA" as const },
			{ action: "PICK" as const, side: "BRAVO" as const },
		];
		const stepsWithRoll = [
			{ action: "BAN" as const, side: "ALPHA" as const },
			{ action: "ROLL" as const },
		];

		expect(validateCustomFlowSection(stepsWithPick, "preSet")).not.toContain(
			CUSTOM_FLOW_VALIDATION_ERRORS.TOO_MANY_MAP_PICKS,
		);
		expect(validateCustomFlowSection(stepsWithRoll, "preSet")).not.toContain(
			CUSTOM_FLOW_VALIDATION_ERRORS.TOO_MANY_MAP_PICKS,
		);
	});

	it("allows exactly one MODE_PICK", () => {
		const steps = [
			{ action: "MODE_PICK" as const, side: "ALPHA" as const },
			{ action: "PICK" as const, side: "BRAVO" as const },
		];

		const errors = validateCustomFlowSection(steps, "preSet");

		expect(errors).not.toContain(
			CUSTOM_FLOW_VALIDATION_ERRORS.TOO_MANY_MODE_PICKS,
		);
	});

	it("returns LAST_STEP_MUST_BE_PICK_OR_ROLL for empty steps array", () => {
		expect(validateCustomFlowSection([], "preSet")).toContain(
			CUSTOM_FLOW_VALIDATION_ERRORS.LAST_STEP_MUST_BE_PICK_OR_ROLL,
		);
	});

	it("returns SAME_TEAM_MODE_AND_MAP_PICK when same side does MODE_PICK and PICK", () => {
		const steps = [
			{ action: "MODE_PICK" as const, side: "ALPHA" as const },
			{ action: "PICK" as const, side: "ALPHA" as const },
		];

		expect(validateCustomFlowSection(steps, "preSet")).toContain(
			CUSTOM_FLOW_VALIDATION_ERRORS.SAME_TEAM_MODE_AND_MAP_PICK,
		);
	});

	it("returns SAME_TEAM_MODE_AND_MAP_PICK even with bans between", () => {
		const steps = [
			{ action: "MODE_PICK" as const, side: "HIGHER_SEED" as const },
			{ action: "BAN" as const, side: "LOWER_SEED" as const },
			{ action: "PICK" as const, side: "HIGHER_SEED" as const },
		];

		expect(validateCustomFlowSection(steps, "preSet")).toContain(
			CUSTOM_FLOW_VALIDATION_ERRORS.SAME_TEAM_MODE_AND_MAP_PICK,
		);
	});

	it("does not return SAME_TEAM_MODE_AND_MAP_PICK when different sides", () => {
		const steps = [
			{ action: "MODE_PICK" as const, side: "ALPHA" as const },
			{ action: "PICK" as const, side: "BRAVO" as const },
		];

		expect(validateCustomFlowSection(steps, "preSet")).not.toContain(
			CUSTOM_FLOW_VALIDATION_ERRORS.SAME_TEAM_MODE_AND_MAP_PICK,
		);
	});

	it("does not return SAME_TEAM_MODE_AND_MAP_PICK for MODE_PICK followed by ROLL", () => {
		const steps = [
			{ action: "MODE_PICK" as const, side: "ALPHA" as const },
			{ action: "ROLL" as const },
		];

		expect(validateCustomFlowSection(steps, "preSet")).not.toContain(
			CUSTOM_FLOW_VALIDATION_ERRORS.SAME_TEAM_MODE_AND_MAP_PICK,
		);
	});

	it("can return multiple errors at once", () => {
		const steps = [
			{ action: "MODE_PICK" as const, side: "WINNER" as const },
			{ action: "MODE_PICK" as const, side: "LOSER" as const },
			{ action: "MODE_BAN" as const, side: "ALPHA" as const },
		];

		const errors = validateCustomFlowSection(steps, "preSet");

		expect(errors).toContain(
			CUSTOM_FLOW_VALIDATION_ERRORS.WINNER_LOSER_IN_PRE_SET,
		);
		expect(errors).toContain(CUSTOM_FLOW_VALIDATION_ERRORS.TOO_MANY_MODE_PICKS);
		expect(errors).toContain(
			CUSTOM_FLOW_VALIDATION_ERRORS.LAST_STEP_MUST_BE_PICK_OR_ROLL,
		);
	});
});

describe("resolveCurrentStep", () => {
	const preSet = [
		{ action: "BAN" as const, side: "HIGHER_SEED" as const },
		{ action: "BAN" as const, side: "LOWER_SEED" as const },
		{ action: "PICK" as const, side: "HIGHER_SEED" as const },
	];
	const postGame = [
		{ action: "BAN" as const, side: "WINNER" as const },
		{ action: "PICK" as const, side: "LOSER" as const },
	];

	it("returns preSet steps when eventCount < preSet.length", () => {
		expect(
			resolveCurrentStep({ eventCount: 0, preSet, postGame, resultsCount: 0 }),
		).toEqual(preSet[0]);
		expect(
			resolveCurrentStep({ eventCount: 1, preSet, postGame, resultsCount: 0 }),
		).toEqual(preSet[1]);
		expect(
			resolveCurrentStep({ eventCount: 2, preSet, postGame, resultsCount: 0 }),
		).toEqual(preSet[2]);
	});

	it("returns null when waiting for game result after preSet", () => {
		expect(
			resolveCurrentStep({ eventCount: 3, preSet, postGame, resultsCount: 0 }),
		).toBeNull();
	});

	it("throws when postGame is empty", () => {
		expect(() =>
			resolveCurrentStep({
				eventCount: 3,
				preSet,
				postGame: [],
				resultsCount: 1,
			}),
		).toThrow();
	});

	it("returns postGame steps after first game result", () => {
		expect(
			resolveCurrentStep({ eventCount: 3, preSet, postGame, resultsCount: 1 }),
		).toEqual(postGame[0]);
		expect(
			resolveCurrentStep({ eventCount: 4, preSet, postGame, resultsCount: 1 }),
		).toEqual(postGame[1]);
	});

	it("returns null when waiting for next game result after postGame cycle", () => {
		expect(
			resolveCurrentStep({ eventCount: 5, preSet, postGame, resultsCount: 1 }),
		).toBeNull();
	});

	it("cycles postGame steps after subsequent results", () => {
		expect(
			resolveCurrentStep({ eventCount: 5, preSet, postGame, resultsCount: 2 }),
		).toEqual(postGame[0]);
		expect(
			resolveCurrentStep({ eventCount: 6, preSet, postGame, resultsCount: 2 }),
		).toEqual(postGame[1]);
	});
});

describe("resolveTeamFromSide", () => {
	const teams: [PickBanTeam, PickBanTeam] = [
		{ id: 100, seed: 2 },
		{ id: 200, seed: 1 },
	];

	it("resolves ALPHA to teams[0]", () => {
		expect(resolveTeamFromSide({ side: "ALPHA", teams, results: [] })).toBe(
			100,
		);
	});

	it("resolves BRAVO to teams[1]", () => {
		expect(resolveTeamFromSide({ side: "BRAVO", teams, results: [] })).toBe(
			200,
		);
	});

	it("resolves HIGHER_SEED to teams[1]", () => {
		expect(
			resolveTeamFromSide({ side: "HIGHER_SEED", teams, results: [] }),
		).toBe(200);
	});

	it("resolves LOWER_SEED to teams[0]", () => {
		expect(
			resolveTeamFromSide({ side: "LOWER_SEED", teams, results: [] }),
		).toBe(100);
	});

	it("resolves HIGHER_SEED by seed, not array position", () => {
		const swappedTeams: [PickBanTeam, PickBanTeam] = [
			{ id: 200, seed: 1 },
			{ id: 100, seed: 2 },
		];

		expect(
			resolveTeamFromSide({
				side: "HIGHER_SEED",
				teams: swappedTeams,
				results: [],
			}),
		).toBe(200);
	});

	it("resolves LOWER_SEED by seed, not array position", () => {
		const swappedTeams: [PickBanTeam, PickBanTeam] = [
			{ id: 200, seed: 1 },
			{ id: 100, seed: 2 },
		];

		expect(
			resolveTeamFromSide({
				side: "LOWER_SEED",
				teams: swappedTeams,
				results: [],
			}),
		).toBe(100);
	});

	it("resolves WINNER to last game winner", () => {
		expect(
			resolveTeamFromSide({
				side: "WINNER",
				teams,
				results: [{ winnerTeamId: 200 }],
			}),
		).toBe(200);
	});

	it("resolves LOSER to last game loser", () => {
		expect(
			resolveTeamFromSide({
				side: "LOSER",
				teams,
				results: [{ winnerTeamId: 200 }],
			}),
		).toBe(100);
	});

	it("resolves RANDOM to the coin-flip team index", () => {
		expect(
			resolveTeamFromSide({
				side: "RANDOM",
				teams,
				results: [],
				randomTeamIndex: 0,
			}),
		).toBe(100);
		expect(
			resolveTeamFromSide({
				side: "RANDOM",
				teams,
				results: [],
				randomTeamIndex: 1,
			}),
		).toBe(200);
	});

	it("resolves RANDOM_OTHER to the complement of the coin flip", () => {
		expect(
			resolveTeamFromSide({
				side: "RANDOM_OTHER",
				teams,
				results: [],
				randomTeamIndex: 0,
			}),
		).toBe(200);
		expect(
			resolveTeamFromSide({
				side: "RANDOM_OTHER",
				teams,
				results: [],
				randomTeamIndex: 1,
			}),
		).toBe(100);
	});

	it("throws when RANDOM side is missing randomTeamIndex", () => {
		expect(() =>
			resolveTeamFromSide({ side: "RANDOM", teams, results: [] }),
		).toThrow();
	});
});

describe("randomWhoTeamIndex", () => {
	it("is deterministic for the same match and draw group", () => {
		const args = {
			matchId: 42,
			eventIndex: 0,
			preSetLength: 3,
			postGameLength: 2,
		};

		expect(randomWhoTeamIndex(args)).toBe(randomWhoTeamIndex(args));
	});

	it("returns 0 or 1", () => {
		for (let matchId = 1; matchId <= 20; matchId++) {
			const result = randomWhoTeamIndex({
				matchId,
				eventIndex: 0,
				preSetLength: 3,
				postGameLength: 2,
			});
			expect(result === 0 || result === 1).toBe(true);
		}
	});

	it("shares a single flip across all pre-set steps", () => {
		const base = { matchId: 7, preSetLength: 3, postGameLength: 2 };
		const draw0 = randomWhoTeamIndex({ ...base, eventIndex: 0 });
		const draw1 = randomWhoTeamIndex({ ...base, eventIndex: 1 });
		const draw2 = randomWhoTeamIndex({ ...base, eventIndex: 2 });

		expect(draw1).toBe(draw0);
		expect(draw2).toBe(draw0);
	});

	it("shares a single flip within a post-game cycle but re-keys per map", () => {
		const base = { matchId: 7, preSetLength: 3, postGameLength: 2 };
		// cycle 0 => eventIndex 3, 4
		const cycle0a = randomWhoTeamIndex({ ...base, eventIndex: 3 });
		const cycle0b = randomWhoTeamIndex({ ...base, eventIndex: 4 });
		// cycle 1 => eventIndex 5, 6
		const cycle1a = randomWhoTeamIndex({ ...base, eventIndex: 5 });
		const cycle1b = randomWhoTeamIndex({ ...base, eventIndex: 6 });

		expect(cycle0b).toBe(cycle0a);
		expect(cycle1b).toBe(cycle1a);
	});

	it("re-flips independently across maps (some match reflips)", () => {
		const differs = Array.from({ length: 30 }, (_, i) => i + 1).some(
			(matchId) => {
				const base = { matchId, preSetLength: 0, postGameLength: 1 };
				const map0 = randomWhoTeamIndex({ ...base, eventIndex: 0 });
				const map1 = randomWhoTeamIndex({ ...base, eventIndex: 1 });
				return map0 !== map1;
			},
		);

		expect(differs).toBe(true);
	});
});

describe("turnOf / teamOfEvent — RANDOM sides", () => {
	const randomMaps: TournamentRoundMaps = {
		count: 5,
		type: "BEST_OF",
		pickBan: "CUSTOM",
		customFlow: {
			preSet: [
				{ action: "BAN", side: "RANDOM" },
				{ action: "BAN", side: "RANDOM_OTHER" },
				{ action: "PICK", side: "RANDOM" },
			],
			postGame: [{ action: "PICK", side: "WINNER" }],
		},
	};
	const teams: [PickBanTeam, PickBanTeam] = [
		{ id: 100, seed: 2 },
		{ id: 200, seed: 1 },
	];
	const teamIds = [100, 200];

	it("resolves RANDOM to one of the two teams", () => {
		const result = turnOf({
			matchId: 55,
			results: [],
			maps: randomMaps,
			teams,
			pickBanEventCount: 0,
		});

		expect(teamIds).toContain(result?.teamId);
		expect(result?.action).toBe("BAN");
	});

	it("resolves RANDOM_OTHER to the complement of RANDOM within the same pre-set", () => {
		const randomTurn = turnOf({
			matchId: 55,
			results: [],
			maps: randomMaps,
			teams,
			pickBanEventCount: 0,
		});
		const randomOtherTurn = turnOf({
			matchId: 55,
			results: [],
			maps: randomMaps,
			teams,
			pickBanEventCount: 1,
		});

		expect(randomOtherTurn?.teamId).not.toBe(randomTurn?.teamId);
		expect(teamIds).toContain(randomOtherTurn?.teamId);
	});

	it("keeps RANDOM stable across steps sharing a draw group", () => {
		const firstRandom = turnOf({
			matchId: 55,
			results: [],
			maps: randomMaps,
			teams,
			pickBanEventCount: 0,
		});
		const secondRandom = turnOf({
			matchId: 55,
			results: [],
			maps: randomMaps,
			teams,
			pickBanEventCount: 2,
		});

		expect(secondRandom?.teamId).toBe(firstRandom?.teamId);
	});

	it("is deterministic across repeated calls", () => {
		const first = turnOf({
			matchId: 55,
			results: [],
			maps: randomMaps,
			teams,
			pickBanEventCount: 0,
		});
		const second = turnOf({
			matchId: 55,
			results: [],
			maps: randomMaps,
			teams,
			pickBanEventCount: 0,
		});

		expect(second).toEqual(first);
	});

	it("teamOfEvent agrees with the pending turnOf resolution for the same event", () => {
		for (const eventIndex of [0, 1, 2]) {
			const pending = turnOf({
				matchId: 55,
				results: [],
				maps: randomMaps,
				teams,
				pickBanEventCount: eventIndex,
			});
			const recorded = teamOfEvent({
				matchId: 55,
				eventIndex,
				maps: randomMaps,
				teams,
				results: [],
			});

			expect(recorded).toBe(pending?.teamId);
		}
	});
});

describe("turnOf — CUSTOM flow", () => {
	const customMaps: TournamentRoundMaps = {
		count: 5,
		type: "BEST_OF",
		pickBan: "CUSTOM",
		customFlow: {
			preSet: [
				{ action: "BAN", side: "HIGHER_SEED" },
				{ action: "BAN", side: "LOWER_SEED" },
				{ action: "PICK", side: "HIGHER_SEED" },
			],
			postGame: [
				{ action: "BAN", side: "WINNER" },
				{ action: "PICK", side: "LOSER" },
			],
		},
	};
	const teams: [PickBanTeam, PickBanTeam] = [
		{ id: 100, seed: 2 },
		{ id: 200, seed: 1 },
	];

	it("returns first preSet step", () => {
		const result = turnOf({
			matchId: 1,
			results: [],
			maps: customMaps,
			teams,
			pickBanEventCount: 0,
		});

		expect(result).toEqual({
			teamId: 200,
			action: "BAN",
			stepCurrent: 1,
			stepTotal: 1,
		});
	});

	it("returns second preSet step", () => {
		const result = turnOf({
			matchId: 1,
			results: [],
			maps: customMaps,
			teams,
			pickBanEventCount: 1,
		});

		expect(result).toEqual({
			teamId: 100,
			action: "BAN",
			stepCurrent: 1,
			stepTotal: 1,
		});
	});

	it("returns null when waiting for game result", () => {
		const result = turnOf({
			matchId: 1,
			results: [],
			maps: customMaps,
			teams,
			pickBanEventCount: 3,
		});

		expect(result).toBeNull();
	});

	it("returns postGame step after result", () => {
		const result = turnOf({
			matchId: 1,
			results: [{ winnerTeamId: 200 }],
			maps: customMaps,
			teams,
			pickBanEventCount: 3,
		});

		expect(result).toEqual({
			teamId: 200,
			action: "BAN",
			stepCurrent: 1,
			stepTotal: 1,
		});
	});

	it("returns null for ROLL steps", () => {
		const rollMaps: TournamentRoundMaps = {
			count: 3,
			type: "BEST_OF",
			pickBan: "CUSTOM",
			customFlow: {
				preSet: [{ action: "ROLL" }],
				postGame: [],
			},
		};

		const result = turnOf({
			matchId: 1,
			results: [],
			maps: rollMaps,
			teams,
			pickBanEventCount: 0,
		});

		expect(result).toBeNull();
	});

	it("returns null when set is over", () => {
		const result = turnOf({
			matchId: 1,
			results: [
				{ winnerTeamId: 200 },
				{ winnerTeamId: 200 },
				{ winnerTeamId: 200 },
			],
			maps: customMaps,
			teams,
			pickBanEventCount: 7,
		});

		expect(result).toBeNull();
	});

	it("returns null when no customFlow defined", () => {
		const result = turnOf({
			matchId: 1,
			results: [],
			maps: { count: 3, type: "BEST_OF", pickBan: "CUSTOM" },
			teams,
			pickBanEventCount: 0,
		});

		expect(result).toBeNull();
	});
});

describe("turnOf — CUSTOM flow stepCurrent/stepTotal", () => {
	const teams: [PickBanTeam, PickBanTeam] = [
		{ id: 100, seed: 2 },
		{ id: 200, seed: 1 },
	];

	it("counts consecutive bans by same side in preSet", () => {
		const maps: TournamentRoundMaps = {
			count: 5,
			type: "BEST_OF",
			pickBan: "CUSTOM",
			customFlow: {
				preSet: [
					{ action: "BAN", side: "HIGHER_SEED" },
					{ action: "BAN", side: "HIGHER_SEED" },
					{ action: "BAN", side: "LOWER_SEED" },
					{ action: "PICK", side: "LOWER_SEED" },
				],
				postGame: [{ action: "PICK", side: "LOSER" }],
			},
		};

		expect(
			turnOf({ matchId: 1, results: [], maps, teams, pickBanEventCount: 0 }),
		).toMatchObject({ stepCurrent: 1, stepTotal: 2 });

		expect(
			turnOf({ matchId: 1, results: [], maps, teams, pickBanEventCount: 1 }),
		).toMatchObject({ stepCurrent: 2, stepTotal: 2 });

		expect(
			turnOf({ matchId: 1, results: [], maps, teams, pickBanEventCount: 2 }),
		).toMatchObject({ stepCurrent: 1, stepTotal: 1 });
	});

	it("counts consecutive bans by same side in postGame", () => {
		const maps: TournamentRoundMaps = {
			count: 5,
			type: "BEST_OF",
			pickBan: "CUSTOM",
			customFlow: {
				preSet: [{ action: "PICK", side: "HIGHER_SEED" }],
				postGame: [
					{ action: "BAN", side: "WINNER" },
					{ action: "BAN", side: "WINNER" },
					{ action: "PICK", side: "LOSER" },
				],
			},
		};

		expect(
			turnOf({
				matchId: 1,
				results: [{ winnerTeamId: 200 }],
				maps,
				teams,
				pickBanEventCount: 1,
			}),
		).toMatchObject({ stepCurrent: 1, stepTotal: 2 });

		expect(
			turnOf({
				matchId: 1,
				results: [{ winnerTeamId: 200 }],
				maps,
				teams,
				pickBanEventCount: 2,
			}),
		).toMatchObject({ stepCurrent: 2, stepTotal: 2 });

		expect(
			turnOf({
				matchId: 1,
				results: [{ winnerTeamId: 200 }],
				maps,
				teams,
				pickBanEventCount: 3,
			}),
		).toMatchObject({ stepCurrent: 1, stepTotal: 1 });
	});

	it("does not group consecutive steps with different sides", () => {
		const maps: TournamentRoundMaps = {
			count: 5,
			type: "BEST_OF",
			pickBan: "CUSTOM",
			customFlow: {
				preSet: [
					{ action: "BAN", side: "HIGHER_SEED" },
					{ action: "BAN", side: "LOWER_SEED" },
					{ action: "PICK", side: "HIGHER_SEED" },
				],
				postGame: [{ action: "PICK", side: "LOSER" }],
			},
		};

		expect(
			turnOf({ matchId: 1, results: [], maps, teams, pickBanEventCount: 0 }),
		).toMatchObject({ stepCurrent: 1, stepTotal: 1 });

		expect(
			turnOf({ matchId: 1, results: [], maps, teams, pickBanEventCount: 1 }),
		).toMatchObject({ stepCurrent: 1, stepTotal: 1 });
	});

	it("does not group consecutive steps with different actions", () => {
		const maps: TournamentRoundMaps = {
			count: 5,
			type: "BEST_OF",
			pickBan: "CUSTOM",
			customFlow: {
				preSet: [
					{ action: "MODE_BAN", side: "HIGHER_SEED" },
					{ action: "BAN", side: "HIGHER_SEED" },
					{ action: "PICK", side: "HIGHER_SEED" },
				],
				postGame: [{ action: "PICK", side: "LOSER" }],
			},
		};

		expect(
			turnOf({ matchId: 1, results: [], maps, teams, pickBanEventCount: 0 }),
		).toMatchObject({ stepCurrent: 1, stepTotal: 1 });

		expect(
			turnOf({ matchId: 1, results: [], maps, teams, pickBanEventCount: 1 }),
		).toMatchObject({ stepCurrent: 1, stepTotal: 1 });
	});
});

describe("turnOf — BAN_2 flow", () => {
	const ban2Maps: TournamentRoundMaps = {
		count: 5,
		type: "BEST_OF",
		pickBan: "BAN_2",
	};
	const teams: [PickBanTeam, PickBanTeam] = [
		{ id: 100, seed: 2 },
		{ id: 200, seed: 1 },
	];

	it("returns action BAN for first picker", () => {
		const result = turnOf({
			matchId: 1,
			results: [],
			maps: ban2Maps,
			teams,
			mapList: [
				{
					mode: "SZ",
					stageId: 1,
					source: "TO",
					bannedByTournamentTeamId: undefined,
				},
				{
					mode: "SZ",
					stageId: 2,
					source: "TO",
					bannedByTournamentTeamId: undefined,
				},
			],
		});

		expect(result).toEqual({ teamId: 200, action: "BAN" });
	});

	it("returns null when both teams have banned", () => {
		const result = turnOf({
			matchId: 1,
			results: [],
			maps: ban2Maps,
			teams,
			mapList: [
				{ mode: "SZ", stageId: 1, source: "TO", bannedByTournamentTeamId: 200 },
				{ mode: "SZ", stageId: 2, source: "TO", bannedByTournamentTeamId: 100 },
			],
		});

		expect(result).toBeNull();
	});
});

describe("mapsListWithLegality — MODE_PICK restriction survives intervening events", () => {
	const SZ = "SZ" as ModeShort;
	const TC = "TC" as ModeShort;
	const RM = "RM" as ModeShort;

	const toSetMapPool = [
		{ mode: SZ, stageId: 1 as StageId },
		{ mode: SZ, stageId: 2 as StageId },
		{ mode: TC, stageId: 3 as StageId },
		{ mode: TC, stageId: 4 as StageId },
		{ mode: RM, stageId: 5 as StageId },
	];

	const teams = [{ mapPool: [] }, { mapPool: [] }] as unknown as Parameters<
		typeof mapsListWithLegality
	>[0]["teams"];

	const customMaps: TournamentRoundMaps = {
		count: 5,
		type: "BEST_OF",
		pickBan: "CUSTOM",
		customFlow: {
			preSet: [
				{ action: "MODE_PICK", side: "HIGHER_SEED" },
				{ action: "BAN", side: "LOWER_SEED" },
				{ action: "BAN", side: "LOWER_SEED" },
				{ action: "PICK", side: "LOWER_SEED" },
			],
			postGame: [{ action: "PICK", side: "LOSER" }],
		},
	};

	it("restricts to picked mode even when bans happen after MODE_PICK", () => {
		const pickBanEvents: PickBanEvent[] = [
			{ type: "MODE_PICK", stageId: null, mode: SZ },
			{ type: "BAN", stageId: 3 as StageId, mode: TC },
			{ type: "BAN", stageId: 5 as StageId, mode: RM },
		];

		const result = mapsListWithLegality({
			results: [],
			maps: customMaps,
			mapList: null,
			teams,
			pickerTeamId: 100,
			tieBreakerMapPool: [],
			toSetMapPool,
			pickBanEvents,
		});

		const legalModes = new Set(
			result.filter((m) => m.isLegal).map((m) => m.mode),
		);

		// MODE_PICK chose SZ, so only SZ maps should be legal
		expect(legalModes).toEqual(new Set([SZ]));
		// TC and RM should not be legal
		expect(legalModes.has(TC)).toBe(false);
		expect(legalModes.has(RM)).toBe(false);
	});

	it("does not carry MODE_PICK restriction from a previous game section", () => {
		const mapsWithPostGameModePick: TournamentRoundMaps = {
			count: 5,
			type: "BEST_OF",
			pickBan: "CUSTOM",
			customFlow: {
				preSet: [
					{ action: "MODE_PICK", side: "HIGHER_SEED" },
					{ action: "PICK", side: "LOWER_SEED" },
				],
				postGame: [
					{ action: "MODE_BAN", side: "WINNER" },
					{ action: "PICK", side: "LOSER" },
				],
			},
		};

		// preSet: MODE_PICK(SZ), PICK — then game 1 played
		// postGame cycle 1: MODE_BAN(TC), now at PICK step with no MODE_PICK in this section
		const pickBanEvents: PickBanEvent[] = [
			{ type: "MODE_PICK", stageId: null, mode: SZ },
			{ type: "PICK", stageId: 1 as StageId, mode: SZ },
			{ type: "MODE_BAN", stageId: null, mode: TC },
		];

		const result = mapsListWithLegality({
			results: [{ mode: SZ, stageId: 1 as StageId, winnerTeamId: 200 }],
			maps: mapsWithPostGameModePick,
			mapList: null,
			teams,
			pickerTeamId: 100,
			tieBreakerMapPool: [],
			toSetMapPool,
			pickBanEvents,
		});

		const legalModes = new Set(
			result.filter((m) => m.isLegal).map((m) => m.mode),
		);

		// No MODE_PICK in the current postGame section, so SZ restriction should not apply
		// Only TC is mode-banned, SZ and RM should be legal
		expect(legalModes).toEqual(new Set([SZ, RM]));
		expect(legalModes.has(TC)).toBe(false);
	});
});

describe("mapsListWithLegality — pre-set MODE_PICK only restricts the first map", () => {
	const SZ = "SZ" as ModeShort;
	const TC = "TC" as ModeShort;
	const RM = "RM" as ModeShort;

	const toSetMapPool = [
		{ mode: SZ, stageId: 1 as StageId },
		{ mode: SZ, stageId: 2 as StageId },
		{ mode: TC, stageId: 3 as StageId },
		{ mode: TC, stageId: 4 as StageId },
		{ mode: RM, stageId: 5 as StageId },
	];

	const teams = [{ mapPool: [] }, { mapPool: [] }] as unknown as Parameters<
		typeof mapsListWithLegality
	>[0]["teams"];

	const customMaps: TournamentRoundMaps = {
		count: 5,
		type: "BEST_OF",
		pickBan: "CUSTOM",
		customFlow: {
			preSet: [
				{ action: "MODE_PICK", side: "HIGHER_SEED" },
				{ action: "PICK", side: "LOWER_SEED" },
			],
			postGame: [{ action: "PICK", side: "LOSER" }],
		},
	};

	it("does not lock the second map's mode to the pre-set MODE_PICK", () => {
		// preSet: HIGHER_SEED picks mode SZ, LOWER_SEED picks SZ stage 1
		// game 1: SZ stage 1 played, team 200 wins
		// postGame cycle 1: LOSER (100) is now at PICK for game 2's map
		const pickBanEvents: PickBanEvent[] = [
			{ type: "MODE_PICK", stageId: null, mode: SZ },
			{ type: "PICK", stageId: 1 as StageId, mode: SZ },
		];

		const result = mapsListWithLegality({
			results: [{ mode: SZ, stageId: 1 as StageId, winnerTeamId: 200 }],
			maps: customMaps,
			mapList: null,
			teams,
			pickerTeamId: 100,
			tieBreakerMapPool: [],
			toSetMapPool,
			pickBanEvents,
		});

		const legalModes = new Set(
			result.filter((m) => m.isLegal).map((m) => m.mode),
		);

		// The pre-set MODE_PICK only decides the first map's mode; picking the
		// second map should be free to choose any mode, not locked to SZ.
		expect(legalModes.has(TC)).toBe(true);
		expect(legalModes.has(RM)).toBe(true);
	});
});

describe("mapsListWithLegality — PICK_NO_MODE_REPEAT", () => {
	const SZ = "SZ" as ModeShort;
	const TC = "TC" as ModeShort;
	const RM = "RM" as ModeShort;

	const toSetMapPool = [
		{ mode: SZ, stageId: 1 as StageId },
		{ mode: SZ, stageId: 2 as StageId },
		{ mode: TC, stageId: 3 as StageId },
		{ mode: TC, stageId: 4 as StageId },
		{ mode: RM, stageId: 5 as StageId },
	];

	const teams = [{ mapPool: [] }, { mapPool: [] }] as unknown as Parameters<
		typeof mapsListWithLegality
	>[0]["teams"];

	const customMaps: TournamentRoundMaps = {
		count: 5,
		type: "BEST_OF",
		pickBan: "CUSTOM",
		customFlow: {
			preSet: [{ action: "PICK", side: "HIGHER_SEED" }],
			postGame: [{ action: "PICK_NO_MODE_REPEAT", side: "LOSER" }],
		},
	};

	it("excludes modes already played in the set", () => {
		// game 1: SZ stage 1 played, now at PICK_NO_MODE_REPEAT for game 2's map
		const pickBanEvents: PickBanEvent[] = [
			{ type: "PICK", stageId: 1 as StageId, mode: SZ },
		];

		const result = mapsListWithLegality({
			results: [{ mode: SZ, stageId: 1 as StageId, winnerTeamId: 200 }],
			maps: customMaps,
			mapList: null,
			teams,
			pickerTeamId: 100,
			tieBreakerMapPool: [],
			toSetMapPool,
			pickBanEvents,
		});

		const legalModes = new Set(
			result.filter((m) => m.isLegal).map((m) => m.mode),
		);

		// SZ was already played, so it must not be pickable again
		expect(legalModes.has(SZ)).toBe(false);
		expect(legalModes.has(TC)).toBe(true);
		expect(legalModes.has(RM)).toBe(true);
	});

	it("falls back to allowing every mode once all modes have been played", () => {
		// every mode has been played, but each still has an unplayed stage; a mode
		// repeat is now unavoidable so the restriction lifts and the remaining
		// stages of already-played modes become legal again
		const pickBanEvents: PickBanEvent[] = [
			{ type: "PICK", stageId: 1 as StageId, mode: SZ },
			{ type: "PICK", stageId: 3 as StageId, mode: TC },
			{ type: "PICK", stageId: 5 as StageId, mode: RM },
		];

		const result = mapsListWithLegality({
			results: [
				{ mode: SZ, stageId: 1 as StageId, winnerTeamId: 200 },
				{ mode: TC, stageId: 3 as StageId, winnerTeamId: 100 },
				{ mode: RM, stageId: 5 as StageId, winnerTeamId: 200 },
			],
			maps: customMaps,
			mapList: null,
			teams,
			pickerTeamId: 100,
			tieBreakerMapPool: [],
			toSetMapPool,
			pickBanEvents,
		});

		const legalMaps = result.filter((m) => m.isLegal);
		const legalModes = new Set(legalMaps.map((m) => m.mode));

		// SZ and TC each still have an unplayed stage (2 and 4); RM's only stage (5)
		// was played. Modes are no longer restricted, only the played stages are.
		expect(legalModes).toEqual(new Set([SZ, TC]));
		expect(
			legalMaps.some((m) => m.mode === SZ && m.stageId === (2 as StageId)),
		).toBe(true);
	});
});

describe("mapsListWithLegality — pre-set MODE_BAN persists into postGame", () => {
	const SZ = "SZ" as ModeShort;
	const TC = "TC" as ModeShort;
	const RM = "RM" as ModeShort;

	const toSetMapPool = [
		{ mode: SZ, stageId: 1 as StageId },
		{ mode: SZ, stageId: 2 as StageId },
		{ mode: TC, stageId: 3 as StageId },
		{ mode: TC, stageId: 4 as StageId },
		{ mode: RM, stageId: 5 as StageId },
	];

	const teams = [{ mapPool: [] }, { mapPool: [] }] as unknown as Parameters<
		typeof mapsListWithLegality
	>[0]["teams"];

	const customMaps: TournamentRoundMaps = {
		count: 5,
		type: "BEST_OF",
		pickBan: "CUSTOM",
		customFlow: {
			preSet: [{ action: "MODE_BAN", side: "HIGHER_SEED" }, { action: "ROLL" }],
			postGame: [
				{ action: "BAN", side: "WINNER" },
				{ action: "PICK", side: "LOSER" },
			],
		},
	};

	it("keeps a mode banned in pre-set unavailable for picks in later postGame cycles", () => {
		// preSet: HIGHER_SEED bans mode SZ, ROLL lands on TC stage 3
		// game 1: TC stage 3 played, team 200 wins
		// postGame cycle 1: WINNER (200) bans stage 4 (TC); LOSER (100) is now at PICK
		const pickBanEvents: PickBanEvent[] = [
			{ type: "MODE_BAN", stageId: null, mode: SZ },
			{ type: "ROLL", stageId: 3 as StageId, mode: TC },
			{ type: "BAN", stageId: 4 as StageId, mode: TC },
		];

		const result = mapsListWithLegality({
			results: [{ mode: TC, stageId: 3 as StageId, winnerTeamId: 200 }],
			maps: customMaps,
			mapList: null,
			teams,
			pickerTeamId: 100,
			tieBreakerMapPool: [],
			toSetMapPool,
			pickBanEvents,
		});

		const legalModes = new Set(
			result.filter((m) => m.isLegal).map((m) => m.mode),
		);

		expect(legalModes.has(SZ)).toBe(false);
		expect(legalModes).toEqual(new Set([RM]));
	});
});

describe("isModeLegal", () => {
	const SZ = "SZ" as ModeShort;
	const TC = "TC" as ModeShort;
	const RM = "RM" as ModeShort;
	const CB = "CB" as ModeShort;

	const toSetMapPool = [
		{ mode: SZ, stageId: 1 as StageId },
		{ mode: SZ, stageId: 2 as StageId },
		{ mode: TC, stageId: 3 as StageId },
		{ mode: RM, stageId: 5 as StageId },
	];

	const teams = [{ mapPool: [] }, { mapPool: [] }] as unknown as Parameters<
		typeof mapsListWithLegality
	>[0]["teams"];

	const customMaps: TournamentRoundMaps = {
		count: 5,
		type: "BEST_OF",
		pickBan: "CUSTOM",
		customFlow: {
			preSet: [
				{ action: "MODE_BAN", side: "HIGHER_SEED" },
				{ action: "MODE_PICK", side: "LOWER_SEED" },
				{ action: "PICK", side: "LOWER_SEED" },
			],
			postGame: [{ action: "PICK", side: "LOSER" }],
		},
	};

	const baseArgs = {
		results: [],
		maps: customMaps,
		mapList: null,
		teams,
		pickerTeamId: 100,
		tieBreakerMapPool: [],
		toSetMapPool,
	};

	it("returns true for a mode present in the pool with no bans", () => {
		expect(
			isModeLegal({
				mode: TC,
				...baseArgs,
				pickBanEvents: [],
			}),
		).toBe(true);
	});

	it("returns false for a mode that has been banned", () => {
		const pickBanEvents: PickBanEvent[] = [
			{ type: "MODE_BAN", stageId: null, mode: TC },
		];

		expect(
			isModeLegal({
				mode: TC,
				...baseArgs,
				pickBanEvents,
			}),
		).toBe(false);
	});

	it("returns false for a mode not in the map pool", () => {
		expect(
			isModeLegal({
				mode: CB,
				...baseArgs,
				pickBanEvents: [],
			}),
		).toBe(false);
	});
});

describe("turnOf — COUNTERPICK flow", () => {
	const cpMaps: TournamentRoundMaps = {
		count: 3,
		type: "BEST_OF",
		pickBan: "COUNTERPICK",
	};
	const teams: [PickBanTeam, PickBanTeam] = [
		{ id: 100, seed: 2 },
		{ id: 200, seed: 1 },
	];

	it("returns action PICK for loser of last game", () => {
		const result = turnOf({
			matchId: 1,
			results: [{ winnerTeamId: 200 }],
			maps: cpMaps,
			teams,
			mapList: [
				{
					mode: "SZ",
					stageId: 1,
					source: "TO",
					bannedByTournamentTeamId: undefined,
				},
			],
		});

		expect(result).toEqual({ teamId: 100, action: "PICK" });
	});

	it("returns null when match was completed without per-game results (drop-out)", () => {
		const result = turnOf({
			matchId: 1,
			results: [],
			maps: cpMaps,
			teams,
			mapList: [],
		});

		expect(result).toBeNull();
	});
});

describe("teamOfEvent", () => {
	const teams: [PickBanTeam, PickBanTeam] = [
		{ id: 100, seed: 2 },
		{ id: 200, seed: 1 },
	];

	it("returns null when setup is not pick/ban", () => {
		const result = teamOfEvent({
			matchId: 1,
			eventIndex: 0,
			maps: { count: 3, type: "BEST_OF" },
			teams,
			results: [],
		});

		expect(result).toBeNull();
	});

	describe("BAN_2", () => {
		const ban2Maps: TournamentRoundMaps = {
			count: 3,
			type: "BEST_OF",
			pickBan: "BAN_2",
		};

		it("assigns event 0 to teams[1] (first picker)", () => {
			expect(
				teamOfEvent({
					matchId: 1,
					eventIndex: 0,
					maps: ban2Maps,
					teams,
					results: [],
				}),
			).toBe(200);
		});

		it("assigns event 1 to teams[0] (second picker)", () => {
			expect(
				teamOfEvent({
					matchId: 1,
					eventIndex: 1,
					maps: ban2Maps,
					teams,
					results: [],
				}),
			).toBe(100);
		});

		it("returns null for further indices", () => {
			expect(
				teamOfEvent({
					matchId: 1,
					eventIndex: 2,
					maps: ban2Maps,
					teams,
					results: [],
				}),
			).toBeNull();
		});
	});

	describe("COUNTERPICK", () => {
		const cpMaps: TournamentRoundMaps = {
			count: 5,
			type: "BEST_OF",
			pickBan: "COUNTERPICK",
		};

		it("attributes the counterpick to the loser of the preceding result", () => {
			const result = teamOfEvent({
				matchId: 1,
				eventIndex: 0,
				maps: cpMaps,
				teams,
				results: [{ winnerTeamId: 100 }],
			});

			expect(result).toBe(200);
		});

		it("also works for COUNTERPICK_MODE_REPEAT_OK", () => {
			const result = teamOfEvent({
				matchId: 1,
				eventIndex: 1,
				maps: { ...cpMaps, pickBan: "COUNTERPICK_MODE_REPEAT_OK" },
				teams,
				results: [{ winnerTeamId: 100 }, { winnerTeamId: 200 }],
			});

			expect(result).toBe(100);
		});

		it("returns null when no corresponding result exists", () => {
			const result = teamOfEvent({
				matchId: 1,
				eventIndex: 0,
				maps: cpMaps,
				teams,
				results: [],
			});

			expect(result).toBeNull();
		});
	});

	describe("CUSTOM", () => {
		const customMaps: TournamentRoundMaps = {
			count: 5,
			type: "BEST_OF",
			pickBan: "CUSTOM",
			customFlow: {
				preSet: [
					{ action: "BAN", side: "HIGHER_SEED" },
					{ action: "BAN", side: "LOWER_SEED" },
				],
				postGame: [
					{ action: "BAN", side: "WINNER" },
					{ action: "PICK", side: "LOSER" },
				],
			},
		};

		it("resolves preSet steps via side (HIGHER_SEED → teams[1])", () => {
			expect(
				teamOfEvent({
					matchId: 1,
					eventIndex: 0,
					maps: customMaps,
					teams,
					results: [],
				}),
			).toBe(200);
		});

		it("resolves preSet steps via side (LOWER_SEED → teams[0])", () => {
			expect(
				teamOfEvent({
					matchId: 1,
					eventIndex: 1,
					maps: customMaps,
					teams,
					results: [],
				}),
			).toBe(100);
		});

		it("resolves postGame WINNER using the result of that cycle", () => {
			const result = teamOfEvent({
				matchId: 1,
				eventIndex: 2,
				maps: customMaps,
				teams,
				results: [{ winnerTeamId: 100 }],
			});

			expect(result).toBe(100);
		});

		it("resolves postGame LOSER using the result of that cycle", () => {
			const result = teamOfEvent({
				matchId: 1,
				eventIndex: 3,
				maps: customMaps,
				teams,
				results: [{ winnerTeamId: 100 }],
			});

			expect(result).toBe(200);
		});

		it("uses the correct cycle's result across multiple post-game cycles", () => {
			const result = teamOfEvent({
				matchId: 1,
				eventIndex: 4,
				maps: customMaps,
				teams,
				results: [{ winnerTeamId: 100 }, { winnerTeamId: 200 }],
			});

			expect(result).toBe(200);
		});

		it("returns null when customFlow is missing", () => {
			const result = teamOfEvent({
				matchId: 1,
				eventIndex: 0,
				maps: { count: 3, type: "BEST_OF", pickBan: "CUSTOM" },
				teams,
				results: [],
			});

			expect(result).toBeNull();
		});

		it("returns null for ROLL steps (no side)", () => {
			const rollMaps: TournamentRoundMaps = {
				count: 3,
				type: "BEST_OF",
				pickBan: "CUSTOM",
				customFlow: {
					preSet: [{ action: "ROLL" }],
					postGame: [{ action: "PICK", side: "LOSER" }],
				},
			};

			expect(
				teamOfEvent({
					matchId: 1,
					eventIndex: 0,
					maps: rollMaps,
					teams,
					results: [],
				}),
			).toBeNull();
		});
	});
});

describe("currentTurnSessionStartedAt", () => {
	const teams: [PickBanTeam, PickBanTeam] = [
		{ id: 100, seed: 2 },
		{ id: 200, seed: 1 },
	];

	it("returns null when there is no current turn", () => {
		const result = currentTurnSessionStartedAt({
			matchId: 1,
			currentTurn: null,
			events: [],
			results: [],
			matchStartedAt: 1000,
			maps: { count: 3, type: "BEST_OF", pickBan: "BAN_2" },
			teams,
		});

		expect(result).toBeNull();
	});

	it("returns null when matchStartedAt is null", () => {
		const result = currentTurnSessionStartedAt({
			matchId: 1,
			currentTurn: { teamId: 200, action: "BAN" },
			events: [],
			results: [],
			matchStartedAt: null,
			maps: { count: 3, type: "BEST_OF", pickBan: "BAN_2" },
			teams,
		});

		expect(result).toBeNull();
	});

	it("falls back to matchStartedAt when no events or results exist", () => {
		const result = currentTurnSessionStartedAt({
			matchId: 1,
			currentTurn: { teamId: 200, action: "BAN" },
			events: [],
			results: [],
			matchStartedAt: 1000,
			maps: { count: 3, type: "BEST_OF", pickBan: "BAN_2" },
			teams,
		});

		expect(result).toBe(1000);
	});

	it("BAN_2: second banner's session starts at the first ban's timestamp", () => {
		const result = currentTurnSessionStartedAt({
			matchId: 1,
			currentTurn: { teamId: 100, action: "BAN" },
			events: [{ createdAt: 1500 }],
			results: [],
			matchStartedAt: 1000,
			maps: { count: 3, type: "BEST_OF", pickBan: "BAN_2" },
			teams,
		});

		expect(result).toBe(1500);
	});

	it("COUNTERPICK: loser's session starts when the result is reported", () => {
		const result = currentTurnSessionStartedAt({
			matchId: 1,
			currentTurn: { teamId: 200, action: "PICK" },
			events: [],
			results: [{ createdAt: 2000, winnerTeamId: 100 }],
			matchStartedAt: 1000,
			maps: { count: 5, type: "BEST_OF", pickBan: "COUNTERPICK" },
			teams,
		});

		expect(result).toBe(2000);
	});

	it("CUSTOM: consecutive same-team events share the session start", () => {
		const customMaps: TournamentRoundMaps = {
			count: 5,
			type: "BEST_OF",
			pickBan: "CUSTOM",
			customFlow: {
				preSet: [
					{ action: "BAN", side: "HIGHER_SEED" },
					{ action: "BAN", side: "HIGHER_SEED" },
					{ action: "BAN", side: "LOWER_SEED" },
				],
				postGame: [{ action: "PICK", side: "LOSER" }],
			},
		};

		const result = currentTurnSessionStartedAt({
			matchId: 1,
			currentTurn: { teamId: 200, action: "BAN" },
			events: [{ createdAt: 1500 }],
			results: [],
			matchStartedAt: 1000,
			maps: customMaps,
			teams,
		});

		expect(result).toBe(1000);
	});

	it("CUSTOM: a result restarts the session even when the same team is responsible again", () => {
		const customMaps: TournamentRoundMaps = {
			count: 5,
			type: "BEST_OF",
			pickBan: "CUSTOM",
			customFlow: {
				preSet: [{ action: "BAN", side: "HIGHER_SEED" }],
				postGame: [
					{ action: "PICK", side: "LOSER" },
					{ action: "BAN", side: "LOSER" },
				],
			},
		};

		const result = currentTurnSessionStartedAt({
			matchId: 1,
			currentTurn: { teamId: 100, action: "BAN" },
			events: [{ createdAt: 1100 }, { createdAt: 2500 }],
			results: [{ createdAt: 2000, winnerTeamId: 200 }],
			matchStartedAt: 1000,
			maps: customMaps,
			teams,
		});

		expect(result).toBe(2000);
	});
});
