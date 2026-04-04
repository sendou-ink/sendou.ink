import { describe, expect, it } from "vitest";
import type { TournamentRoundMaps } from "~/db/tables";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import {
	CUSTOM_FLOW_VALIDATION_ERRORS,
	isModeLegal,
	mapsListWithLegality,
	type PickBanEvent,
	type PickBanTeam,
	resolveCurrentStep,
	resolveTeamFromSide,
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
			results: [],
			maps: customMaps,
			teams,
			pickBanEventCount: 3,
		});

		expect(result).toBeNull();
	});

	it("returns postGame step after result", () => {
		const result = turnOf({
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
			results: [],
			maps: rollMaps,
			teams,
			pickBanEventCount: 0,
		});

		expect(result).toBeNull();
	});

	it("returns null when set is over", () => {
		const result = turnOf({
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
			turnOf({ results: [], maps, teams, pickBanEventCount: 0 }),
		).toMatchObject({ stepCurrent: 1, stepTotal: 2 });

		expect(
			turnOf({ results: [], maps, teams, pickBanEventCount: 1 }),
		).toMatchObject({ stepCurrent: 2, stepTotal: 2 });

		expect(
			turnOf({ results: [], maps, teams, pickBanEventCount: 2 }),
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
				results: [{ winnerTeamId: 200 }],
				maps,
				teams,
				pickBanEventCount: 1,
			}),
		).toMatchObject({ stepCurrent: 1, stepTotal: 2 });

		expect(
			turnOf({
				results: [{ winnerTeamId: 200 }],
				maps,
				teams,
				pickBanEventCount: 2,
			}),
		).toMatchObject({ stepCurrent: 2, stepTotal: 2 });

		expect(
			turnOf({
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
			turnOf({ results: [], maps, teams, pickBanEventCount: 0 }),
		).toMatchObject({ stepCurrent: 1, stepTotal: 1 });

		expect(
			turnOf({ results: [], maps, teams, pickBanEventCount: 1 }),
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
			turnOf({ results: [], maps, teams, pickBanEventCount: 0 }),
		).toMatchObject({ stepCurrent: 1, stepTotal: 1 });

		expect(
			turnOf({ results: [], maps, teams, pickBanEventCount: 1 }),
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
});
