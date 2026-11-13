import { describe, expect, test } from "vitest";
import type {
	BroadcastGame,
	BroadcastGameSummaryPlayer,
	BroadcastInk,
	BroadcastInkRgb,
	BroadcastMap,
	BroadcastMatch,
	BroadcastScannedGame,
	BroadcastStoredState,
	BroadcastTeam,
	MatchProgress,
} from "~/features/broadcast/broadcast-types";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import * as GameResult from "./GameResult";

const YELLOW: BroadcastInkRgb = { r: 202, g: 190, b: 33 };
const DARK_BLUE: BroadcastInkRgb = { r: 60, g: 32, b: 186 };

const ALPHA = mockTeam(1, ["Noodle", "InkJet", "Squidly", "Marina"]);
const BRAVO = mockTeam(2, ["Kraken", "Blitz", "Mochi", "Zap"]);
const ALPHA_NAMES = ["Noodle", "InkJet", "Squidly", "Marina"];
const BRAVO_NAMES = ["Kraken", "Blitz", "Mochi", "Zap"];

const ZONES_SCORCH: BroadcastMap = { mode: "SZ", stageId: 10 };
const TOWER_EELTAIL: BroadcastMap = { mode: "TC", stageId: 2 };
const RAINMAKER_HAGGLEFISH: BroadcastMap = { mode: "RM", stageId: 3 };

describe("GameResult.resolve", () => {
	test("puts the scanned teams in bracket order by the game's ink", () => {
		const result = resolve({
			scannedGame: scanned({
				inks: [DARK_BLUE, YELLOW],
				teams: [named(BRAVO), named(ALPHA)],
				ink: yellowDarkBlue({ isFlipped: false }),
			}),
		});

		expect(playerNames(result)).toEqual([ALPHA_NAMES, BRAVO_NAMES]);
	});

	test("gives the pair's first color to the team the producer flipped it to", () => {
		const result = resolve({
			scannedGame: scanned({
				inks: [YELLOW, DARK_BLUE],
				teams: [named(BRAVO), named(ALPHA)],
				ink: yellowDarkBlue({ isFlipped: true }),
			}),
		});

		expect(playerNames(result)).toEqual([ALPHA_NAMES, BRAVO_NAMES]);
	});

	test("puts the scanned teams in bracket order by their names without the game's ink", () => {
		const result = resolve({
			scannedGame: scanned({
				inks: [YELLOW, DARK_BLUE],
				teams: [named(BRAVO, ["Krakn", "Blits"]), named(ALPHA, ["Nodle"])],
				ink: null,
			}),
		});

		expect(result?.teams[0].players[0]?.name).toBe("Nodle");
		expect(result?.teams[1].players[0]?.name).toBe("Krakn");
	});

	test("fills the names not read from the roster players no read name matched, ones playing the weapon first", () => {
		const result = resolve({
			scannedGame: scanned({
				teams: [
					{
						players: [
							player({ name: "Squidlee" }),
							player({ name: null, weaponSplId: 4010 }),
							player({ name: null }),
						],
					},
					named(BRAVO),
				],
			}),
		});

		expect(result?.teams[0].players.map((p) => p.name)).toEqual([
			"Squidlee",
			"Marina",
			"Noodle",
		]);
	});

	test("leaves a name not read empty once the roster runs out", () => {
		const result = resolve({
			scannedGame: scanned({
				teams: [
					{
						players: [
							...named(ALPHA).players,
							player({ name: null, weaponSplId: 40 }),
						],
					},
					named(BRAVO),
				],
			}),
		});

		expect(result?.teams[0].players.at(-1)?.name).toBeNull();
	});

	test("orients the counter reads along with the teams", () => {
		const result = resolve({
			scannedGame: scanned({
				inks: [DARK_BLUE, YELLOW],
				ink: yellowDarkBlue({ isFlipped: false }),
				objective: [
					{ t: 0, score: [100, 100], control: null },
					{ t: 30, score: [80, 64], control: 1 },
				],
			}),
		});

		expect(result?.objective).toEqual([
			{ t: 0, score: [100, 100], control: null },
			{ t: 30, score: [64, 80], control: 0 },
		]);
		expect(result?.teams.map((t) => t.score)).toEqual([36, 20]);
	});

	test.each([
		{
			why: "the scanner's results screen read",
			scannedWinner: 1,
			counts: [10, 40],
			reportedWinner: 0,
			expected: 1,
		},
		{
			why: "the team that took more of the counter",
			scannedWinner: null,
			counts: [40, 10],
			reportedWinner: 0,
			expected: 1,
		},
		{
			why: "the reported one of the set's game on a tied counter",
			scannedWinner: null,
			counts: [40, 40],
			reportedWinner: 1,
			expected: 1,
		},
		{
			why: "not known without counter reads or a report",
			scannedWinner: null,
			counts: null,
			reportedWinner: null,
			expected: null,
		},
	] as const)(
		"the winner is $why",
		({ scannedWinner, counts, reportedWinner, expected }) => {
			const result = resolve({
				games: [game({ map: ZONES_SCORCH, winner: reportedWinner })],
				resultCount: reportedWinner === null ? 0 : 1,
				scannedGame: scanned({
					winner: scannedWinner,
					objective: counts
						? [{ t: 0, score: [counts[0], counts[1]], control: null }]
						: [],
				}),
			});

			expect(result?.winner).toBe(expected);
		},
	);

	test("takes a team's score from its last count read", () => {
		const result = resolve({
			scannedGame: scanned({
				objective: [
					{ t: 0, score: [50, 70], control: null },
					{ t: 10, score: [45, null], control: null },
				],
			}),
		});

		expect(result?.teams.map((t) => t.score)).toEqual([55, 30]);
	});

	test("leaves the scores out without counter reads", () => {
		const result = resolve({ scannedGame: scanned({ objective: [] }) });

		expect(result?.teams.map((t) => t.score)).toEqual([null, null]);
	});

	test.each([
		{
			why: "the set's game on its map",
			games: [
				game({ map: ZONES_SCORCH, winner: 0 }),
				game({ map: TOWER_EELTAIL }),
			],
			resultCount: 1,
			expected: 1,
		},
		{
			why: "the last one up to the game being played when the map came up before",
			games: [
				game({ map: ZONES_SCORCH, winner: 0 }),
				game({ map: TOWER_EELTAIL, winner: 1 }),
				game({ map: ZONES_SCORCH }),
				game({ map: ZONES_SCORCH }),
			],
			resultCount: 2,
			expected: 3,
		},
		{
			why: "its map's even after later games were reported",
			games: [
				game({ map: ZONES_SCORCH, winner: 0 }),
				game({ map: TOWER_EELTAIL, winner: 1 }),
				game({ map: RAINMAKER_HAGGLEFISH }),
			],
			resultCount: 2,
			expected: 1,
		},
		{
			why: "not known when no game of the set has its map",
			games: [game({ map: TOWER_EELTAIL })],
			resultCount: 0,
			expected: null,
		},
	])("the game number is $why", ({ games, resultCount, expected }) => {
		const result = resolve({
			games,
			resultCount,
			scannedGame: scanned(ZONES_SCORCH),
		});

		expect(result?.gameNumber).toBe(expected);
	});

	test("leaves the map and game number out when the map wasn't read", () => {
		const result = resolve({
			games: [game({ map: ZONES_SCORCH })],
			scannedGame: scanned({ mode: null, stageId: null }),
		});

		expect(result?.map).toBeNull();
		expect(result?.gameNumber).toBeNull();
	});

	test("shows the game in the ink colors picked for it", () => {
		const ink = yellowDarkBlue({ isFlipped: true });

		expect(resolve({ scannedGame: scanned({ ink }) })?.ink).toEqual(ink);
	});

	test("shows the last game reported with the rosters without a scanned game", () => {
		const result = resolve({
			games: [
				game({ winner: 0, map: ZONES_SCORCH }),
				game({ winner: 1, map: RAINMAKER_HAGGLEFISH }),
			],
			resultCount: 2,
			scannedGame: null,
			ink: { key: "greenPink", isFlipped: false, matchId: 1, resultCount: 1 },
		});

		expect(result).toEqual({
			gameNumber: 2,
			ink: { key: "greenPink", isFlipped: false },
			map: RAINMAKER_HAGGLEFISH,
			winner: 1,
			isKnockout: false,
			teams: [rosterOnly(ALPHA), rosterOnly(BRAVO)],
			objective: [],
		});
	});

	test("shows nothing of a match without a scanned or reported game", () => {
		const result = resolve({ scannedGame: scanned({ matchId: 99 }) });

		expect(result).toBeNull();
	});
});

function resolve({
	games = [],
	resultCount = 0,
	scannedGame,
	ink = null,
}: {
	games?: BroadcastGame[];
	resultCount?: number;
	scannedGame: BroadcastScannedGame | null;
	ink?: BroadcastStoredState["ink"];
}) {
	const progress: MatchProgress = {
		resultCount,
		scores: [0, 0],
		isOver: false,
		gameNumber: resultCount + 1,
		currentMap: null,
		games,
	};
	const match: BroadcastMatch = {
		id: 1,
		bracketName: null,
		roundName: null,
		countType: "BEST_OF",
		count: 5,
		teams: [ALPHA, BRAVO],
		progress: { live: progress, next: progress },
	};

	return GameResult.resolve({ match, view: "live", scannedGame, ink });
}

function yellowDarkBlue({ isFlipped }: { isFlipped: boolean }): BroadcastInk {
	return { key: "yellowDarkBlue", isFlipped };
}

function game(overrides: Partial<BroadcastGame>): BroadcastGame {
	return { map: null, winner: null, ...overrides };
}

function scanned(
	overrides: Partial<BroadcastScannedGame> = {},
): BroadcastScannedGame {
	return {
		matchId: 1,
		ink: null,
		mode: ZONES_SCORCH.mode,
		stageId: ZONES_SCORCH.stageId,
		isKnockout: false,
		winner: null,
		inks: [null, null],
		teams: [named(ALPHA), named(BRAVO)],
		objective: [],
		...overrides,
	};
}

function named(team: BroadcastTeam, names = team.players.map((p) => p.name)) {
	return { players: names.map((name) => player({ name })) };
}

function player(
	overrides: Partial<BroadcastGameSummaryPlayer>,
): BroadcastGameSummaryPlayer {
	return {
		name: null,
		weaponSplId: 40,
		abilities: ["SJ", "QR", "SSU"],
		...overrides,
	};
}

function rosterOnly(team: BroadcastTeam) {
	return {
		score: null,
		players: team.players.map((p) => ({
			name: p.name,
			weaponSplId: null,
			abilities: [],
		})),
	};
}

function playerNames(result: ReturnType<typeof resolve>) {
	return result?.teams.map((t) => t.players.map((p) => p.name));
}

function mockTeam(id: number, names: string[]): BroadcastTeam {
	const weapons: MainWeaponId[][] = [[40], [1010], [2010], [4010]];

	return {
		id,
		name: `Team ${id}`,
		logoUrl: null,
		seed: id,
		players: names.map((name, i) => ({
			userId: id * 10 + i,
			name,
			avatarUrl: null,
			weapons: weapons[i]!,
			country: null,
		})),
	};
}
