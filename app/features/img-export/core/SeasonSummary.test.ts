import { describe, expect, test } from "vitest";
import * as SeasonSummary from "./SeasonSummary";

const win = { ownScore: 4, opponentScore: 2 };
const loss = { ownScore: 1, opponentScore: 4 };

describe("longestWinStreak", () => {
	test("returns 0 for no sets", () => {
		expect(SeasonSummary.longestWinStreak([])).toBe(0);
	});

	test("returns 0 when every set was lost", () => {
		expect(SeasonSummary.longestWinStreak([loss, loss])).toBe(0);
	});

	test("counts consecutive wins only", () => {
		expect(
			SeasonSummary.longestWinStreak([win, win, loss, win, win, win, loss]),
		).toBe(3);
	});

	test("counts a streak lasting until the end", () => {
		expect(SeasonSummary.longestWinStreak([loss, win, win])).toBe(2);
	});
});

describe("clutchRecord", () => {
	test("returns zeros for no sets", () => {
		expect(SeasonSummary.clutchRecord([])).toEqual({ won: 0, total: 0 });
	});

	test("only counts sets decided by one map", () => {
		expect(
			SeasonSummary.clutchRecord([
				{ ownScore: 4, opponentScore: 3 },
				{ ownScore: 2, opponentScore: 3 },
				{ ownScore: 4, opponentScore: 2 },
				{ ownScore: 0, opponentScore: 4 },
				{ ownScore: 2, opponentScore: 1 },
			]),
		).toEqual({ won: 2, total: 3 });
	});
});

describe("bestStage", () => {
	test("returns undefined when no stage has enough maps played", () => {
		expect(
			SeasonSummary.bestStage({
				1: { SZ: { wins: 2, losses: 0 } },
			}),
		).toBeUndefined();
	});

	test("aggregates winrate across modes", () => {
		expect(
			SeasonSummary.bestStage({
				1: { SZ: { wins: 4, losses: 2 }, TC: { wins: 2, losses: 2 } },
			}),
		).toEqual({ stageId: 1, winratePercentage: 60 });
	});

	test("picks the stage with the highest winrate among qualified ones", () => {
		expect(
			SeasonSummary.bestStage({
				1: { SZ: { wins: 9, losses: 1 } },
				2: { SZ: { wins: 5, losses: 5 } },
				3: { SZ: { wins: 8, losses: 2 } },
			}),
		).toEqual({ stageId: 1, winratePercentage: 90 });
	});

	test("does not let a low sample size stage win over a qualified one", () => {
		expect(
			SeasonSummary.bestStage({
				1: { SZ: { wins: 3, losses: 0 } },
				2: { SZ: { wins: 7, losses: 3 } },
			}),
		).toEqual({ stageId: 2, winratePercentage: 70 });
	});
});

describe("tournamentRunScore", () => {
	test("lets tier dominate over placement quality", () => {
		const higherTierRun = SeasonSummary.tournamentRunScore({
			tier: 2,
			placement: 2,
			teamsCount: 32,
			topEightAvgSp: null,
		});
		const lowerTierWin = SeasonSummary.tournamentRunScore({
			tier: 3,
			placement: 1,
			teamsCount: 64,
			topEightAvgSp: null,
		});

		expect(higherTierRun).toBeGreaterThan(lowerTierWin);
	});

	test("rewards better placement within the same tier", () => {
		const winner = SeasonSummary.tournamentRunScore({
			tier: 5,
			placement: 1,
			teamsCount: 16,
			topEightAvgSp: null,
		});
		const runnerUp = SeasonSummary.tournamentRunScore({
			tier: 5,
			placement: 2,
			teamsCount: 16,
			topEightAvgSp: null,
		});

		expect(winner).toBeGreaterThan(runnerUp);
	});

	test("scores an untiered tournament below a tiered one with a similar run", () => {
		const untiered = SeasonSummary.tournamentRunScore({
			tier: null,
			placement: 1,
			teamsCount: 16,
			topEightAvgSp: null,
		});
		const tiered = SeasonSummary.tournamentRunScore({
			tier: 9,
			placement: 1,
			teamsCount: 16,
			topEightAvgSp: null,
		});

		expect(untiered).toBeLessThan(tiered);
	});

	test("breaks a tie between identical runs of the same tier by field strength", () => {
		const strongField = SeasonSummary.tournamentRunScore({
			tier: 4,
			placement: 3,
			teamsCount: 24,
			topEightAvgSp: 2600,
		});
		const weakField = SeasonSummary.tournamentRunScore({
			tier: 4,
			placement: 3,
			teamsCount: 24,
			topEightAvgSp: 1400,
		});

		expect(strongField).toBeGreaterThan(weakField);
	});

	test("does not let field strength outweigh a tier step", () => {
		const strongerField = SeasonSummary.tournamentRunScore({
			tier: 4,
			placement: 3,
			teamsCount: 24,
			topEightAvgSp: 3000,
		});
		const higherTier = SeasonSummary.tournamentRunScore({
			tier: 3,
			placement: 3,
			teamsCount: 24,
			topEightAvgSp: 1200,
		});

		expect(strongerField).toBeLessThan(higherTier);
	});
});

describe("bestTournamentRun", () => {
	test("returns undefined for no runs", () => {
		expect(SeasonSummary.bestTournamentRun([])).toBeUndefined();
	});

	test("picks the run with the highest score", () => {
		const runs = [
			{ tier: 6, placement: 1, teamsCount: 32, topEightAvgSp: 2400 },
			{ tier: 2, placement: 10, teamsCount: 32, topEightAvgSp: 1800 },
			{ tier: null, placement: 1, teamsCount: 100, topEightAvgSp: 2900 },
		];

		expect(SeasonSummary.bestTournamentRun(runs)).toBe(runs[1]);
	});

	test("picks the stronger field among runs tied by tier and placement", () => {
		const runs = [
			{ tier: 3, placement: 5, teamsCount: 32, topEightAvgSp: 1900 },
			{ tier: 3, placement: 5, teamsCount: 32, topEightAvgSp: 2500 },
			{ tier: 3, placement: 5, teamsCount: 32, topEightAvgSp: null },
		];

		expect(SeasonSummary.bestTournamentRun(runs)).toBe(runs[1]);
	});
});

describe("topWeaponUsages", () => {
	test("returns empty array for no reported weapons", () => {
		expect(SeasonSummary.topWeaponUsages([])).toEqual([]);
	});

	test("returns the most used weapons with their usage share", () => {
		expect(
			SeasonSummary.topWeaponUsages([
				{ weaponSplId: 40, count: 10 },
				{ weaponSplId: 1001, count: 5 },
				{ weaponSplId: 2070, count: 4 },
				{ weaponSplId: 0, count: 1 },
			]),
		).toEqual([
			{ weaponSplId: 40, usagePercentage: 50 },
			{ weaponSplId: 1001, usagePercentage: 25 },
			{ weaponSplId: 2070, usagePercentage: 20 },
		]);
	});
});

// season 11 ended 2026-05-17, season 12 started 2026-06-01
const OFF_SEASON_DATE = new Date("2026-05-20T12:00:00Z");
const MID_SEASON_12_DATE = new Date("2026-06-10T12:00:00Z");

describe("isSeasonExportableByAll", () => {
	test("latest finished season is exportable during off-season", () => {
		expect(SeasonSummary.isSeasonExportableByAll(11, OFF_SEASON_DATE)).toBe(
			true,
		);
	});

	test("older seasons are not exportable during off-season", () => {
		expect(SeasonSummary.isSeasonExportableByAll(10, OFF_SEASON_DATE)).toBe(
			false,
		);
	});

	test("nothing is exportable while a season is in progress", () => {
		expect(SeasonSummary.isSeasonExportableByAll(11, MID_SEASON_12_DATE)).toBe(
			false,
		);
	});
});

describe("canExportSeasonSummary", () => {
	const baseArgs = {
		loggedInUser: { id: 1, roles: [] },
		profileUserId: 1,
		season: 11,
		seasonsParticipatedIn: [11, 10],
		hasCalculatedSkill: true,
		date: OFF_SEASON_DATE,
	};

	test("allows the profile owner to export the latest finished season during off-season", () => {
		expect(SeasonSummary.canExportSeasonSummary(baseArgs)).toBe(true);
	});

	test("disallows exporting someone else's profile", () => {
		expect(
			SeasonSummary.canExportSeasonSummary({ ...baseArgs, profileUserId: 2 }),
		).toBe(false);
	});

	test("disallows without being logged in", () => {
		expect(
			SeasonSummary.canExportSeasonSummary({
				...baseArgs,
				loggedInUser: undefined,
			}),
		).toBe(false);
	});

	test("disallows a season not participated in", () => {
		expect(
			SeasonSummary.canExportSeasonSummary({
				...baseArgs,
				seasonsParticipatedIn: [10],
			}),
		).toBe(false);
	});

	test("disallows without a calculated skill", () => {
		expect(
			SeasonSummary.canExportSeasonSummary({
				...baseArgs,
				hasCalculatedSkill: false,
			}),
		).toBe(false);
	});

	test("disallows a non-supporter exporting an older season", () => {
		expect(
			SeasonSummary.canExportSeasonSummary({ ...baseArgs, season: 10 }),
		).toBe(false);
	});

	test("allows a supporter to export any finished participated season, also mid-season", () => {
		expect(
			SeasonSummary.canExportSeasonSummary({
				...baseArgs,
				loggedInUser: { id: 1, roles: ["SUPPORTER" as const] },
				season: 10,
				date: MID_SEASON_12_DATE,
			}),
		).toBe(true);
	});

	test("disallows exporting an ongoing season", () => {
		expect(
			SeasonSummary.canExportSeasonSummary({
				...baseArgs,
				season: 12,
				seasonsParticipatedIn: [12, 11, 10],
				date: MID_SEASON_12_DATE,
			}),
		).toBe(false);
	});

	test("disallows a supporter exporting an ongoing season", () => {
		expect(
			SeasonSummary.canExportSeasonSummary({
				...baseArgs,
				loggedInUser: { id: 1, roles: ["SUPPORTER" as const] },
				season: 12,
				seasonsParticipatedIn: [12, 11, 10],
				date: MID_SEASON_12_DATE,
			}),
		).toBe(false);
	});
});
