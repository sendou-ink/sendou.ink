import { Config } from "~/config";
import type {
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import { mainWeaponIds } from "~/modules/in-game-lists/weapon-ids";
import type { SearchParamsValues } from "~/modules/search-params/search-params";
import type { broadcastDesignSearchParams } from "../broadcast-search-params";
import type {
	BroadcastBracket,
	BroadcastBracketMatch,
	BroadcastBracketRound,
	BroadcastBracketSide,
	BroadcastBracketTeam,
	BroadcastCaster,
	BroadcastMap,
	BroadcastMatch,
	BroadcastOtherMatch,
	BroadcastSettings,
	BroadcastState,
	BroadcastTeam,
	BroadcastTeamSpotlight,
	MatchProgress,
	ProducerState,
} from "../broadcast-types";
import { broadcastDesignImageUrl } from "../broadcast-urls";
import * as SetProgress from "./SetProgress";

/** The designer's mock scenario, see `broadcastDesignSearchParams`. */
export type Scenario = Omit<
	SearchParamsValues<typeof broadcastDesignSearchParams.shape>,
	"footage"
>;

const TEAM_NAMES = {
	short: [
		"Ink",
		"Zap",
		"Kelp",
		"Moss",
		"Fizz",
		"Glow",
		"Tide",
		"Wave",
		"Bolt",
		"Rush",
		"Dusk",
		"Nova",
		"Puff",
		"Clam",
		"Reef",
		"Krill",
	],
	typical: [
		"Moonlight",
		"Team Olive",
		"Splash Mob",
		"Ink Theory",
		"Coral Crew",
		"Deep Current",
		"Night Owls",
		"Tidal Force",
		"Golden Hour",
		"Paper Planes",
		"Salmon Run Club",
		"Velvet Ink",
		"Sea Breeze",
		"Neon Drift",
		"Static Shock",
		"Blue Lagoon",
	],
	long: [
		"The Absolutely Unstoppable Inklings",
		"Professional Turf Inking Association",
		"Somewhere Over the Rainmaker Rainbow",
		"Calamari Inkantation Appreciation Club",
		"Fresh Season Flagship Main Roster",
		"We Honestly Only Practice Splat Zones",
		"Nobody Expects the Spanish Inkquisition",
		"Last Minute Overtime Comeback Kids",
		"Definitely Not Just Four Chargers",
		"Inkopolis Plaza After Dark Collective",
		"Splatlands Regional Champions 2026",
		"Grizzco Industries Overtime Department",
		"The Booyah Bomb Enthusiast Society",
		"Hagglefish Market Night Shift Crew",
		"Sunken Scroll Treasure Hunters United",
		"Ultra Signal Somehow Still Unclaimed",
	],
} as const;

const PLAYER_NAMES = {
	short: [
		"Ai",
		"Bo",
		"Cy",
		"Di",
		"Ed",
		"Fu",
		"Gi",
		"Hu",
		"Io",
		"Jo",
		"Ky",
		"Lu",
		"Mo",
		"Ny",
		"Oz",
		"Pi",
	],
	typical: [
		"Noodle",
		"InkJet",
		"Squidly",
		"Marina♪",
		"Tako",
		"Pearlie",
		"Bubbles",
		"Sprinkle",
		"Kraken",
		"Blitz",
		"Mochi",
		"Zap",
		"Riptide",
		"Pixel",
		"Comet",
		"Juno",
	],
	long: [
		"xX_InklingSlayer_Xx",
		"TheRealChargerMain",
		"ProbablyStillCharging",
		"SplatZonesEnjoyer99",
		"NotActuallyAnOctoling",
		"CaptainOfTheTurfWar",
		"BooyahBombBelieverr",
		"TriSlosherTheBest",
		"SalmonRunScholar404",
		"MidnightInkMachine",
		"OnlyHereForTheVibes",
		"SquidBeakSplatoonGuy",
		"InkSplattererSupreme",
		"KingOfTheSplatZones",
		"TowerRiderExtraordi",
		"ClamBlitzStrategist",
	],
} as const;

const COUNTRIES = ["FI", "JP", "US", "FR", "DE", "GB", "ES", "NL"];

/** Stands in for the logo of a tournament without one of its own. */
const FALLBACK_TOURNAMENT_LOGO = broadcastDesignImageUrl(
	"mock/logos/in-the-zone.webp",
);

/** Real teams playing the featured match, their logos and players replacing the mock ones. */
const FEATURED_TEAMS: Array<{
	logoUrl: string;
	players: Array<{
		name: string;
		avatarUrl: string | null;
		weapons: MainWeaponId[] | null;
		country: string | null;
	}>;
}> = [
	{
		logoUrl: broadcastDesignImageUrl("mock/logos/moonlight.webp"),
		players: [
			{
				name: "shadowind",
				avatarUrl: broadcastDesignImageUrl("mock/avatars/shadowind.webp"),
				weapons: [3011, 6011],
				country: "US",
			},
			{
				name: "Basil",
				avatarUrl: broadcastDesignImageUrl("mock/avatars/basil.webp"),
				weapons: [2030],
				country: "US",
			},
			{
				name: "Omegα",
				avatarUrl: broadcastDesignImageUrl("mock/avatars/omega.webp"),
				weapons: [1001, 8020],
				country: null,
			},
			{
				name: "SSNolan <3",
				avatarUrl: broadcastDesignImageUrl("mock/avatars/ssnolan.webp"),
				weapons: [81, 261],
				country: "US",
			},
		],
	},
	{
		logoUrl: broadcastDesignImageUrl("mock/logos/team-olive.webp"),
		players: [
			{
				name: "Sendou",
				avatarUrl: broadcastDesignImageUrl("mock/avatars/sendou.webp"),
				weapons: [60, 211, 6011, 252],
				country: "FI",
			},
			{
				name: "Brian",
				avatarUrl: broadcastDesignImageUrl("mock/avatars/brian.webp"),
				weapons: [4030, 3040, 20],
				country: "NL",
			},
			{
				name: "Sorin",
				avatarUrl: broadcastDesignImageUrl("mock/avatars/sorin.webp"),
				weapons: null,
				country: null,
			},
			{
				name: "Scar",
				avatarUrl: broadcastDesignImageUrl("mock/avatars/scar.webp"),
				weapons: null,
				country: null,
			},
		],
	},
];

const MODES: ModeShort[] = ["SZ", "TC", "RM", "CB"];

const STAGES: StageId[] = [10, 2, 5, 8, 13, 17, 20, 1];

const CASTERS: BroadcastCaster[] = [
	{ userId: 1, name: "Lean", pronouns: { subject: "he", object: "him" } },
	{ userId: 2, name: "Sendou", pronouns: null },
	{ userId: 3, name: "Brie", pronouns: { subject: "she", object: "her" } },
];

const MOCK_HEADLINE = "Top 8 starts at 18:00 CEST";

/** Teams of the featured match, by their index in the name pools. */
const FEATURED: [number, number] = [0, 1];

/** Rounds of a mock bracket: matches by their teams' indexes, `F` the featured match, "live" being played. */
type MockRound = {
	name: string;
	connector: BroadcastBracketRound["connector"];
	matches: Array<[number | null, number | null, number | "F" | "live" | null]>;
};

const DOUBLE_ELIMINATION: Record<"winners" | "losers", MockRound[]> = {
	winners: [
		{
			name: "WB Round 1",
			connector: "pairs",
			matches: [
				[0, 7, 0],
				[3, 4, 3],
				[1, 6, 1],
				[2, 5, 2],
			],
		},
		{
			name: "WB Semis",
			connector: "pairs",
			matches: [
				[0, 3, 0],
				[1, 2, 1],
			],
		},
		{ name: "WB Finals", connector: "straight", matches: [[0, 1, "F"]] },
		{ name: "Grand Finals", connector: null, matches: [[null, null, null]] },
	],
	losers: [
		{
			name: "LB Round 1",
			connector: "straight",
			matches: [
				[7, 4, 4],
				[6, 5, 5],
			],
		},
		{
			name: "LB Round 2",
			connector: "pairs",
			matches: [
				[2, 4, 2],
				[3, 5, "live"],
			],
		},
		{ name: "LB Semis", connector: "straight", matches: [[2, null, null]] },
		{ name: "LB Finals", connector: null, matches: [[null, null, null]] },
	],
};

const SINGLE_ELIMINATION: MockRound[] = [
	{
		name: "Quarterfinals",
		connector: "pairs",
		matches: [
			[0, 7, 0],
			[1, 6, 1],
			[2, 5, 2],
			[3, 4, "live"],
		],
	},
	{
		name: "Semifinals",
		connector: "pairs",
		matches: [
			[0, 1, "F"],
			[2, null, null],
		],
	},
	{ name: "Finals", connector: null, matches: [[null, null, null]] },
];

/** Six teams, each round's pairs by the circle method, the featured match in the last round. */
const ROUND_ROBIN: MockRound["matches"][] = [
	[
		[0, 5, 0],
		[1, 4, 1],
		[2, 3, 3],
	],
	[
		[0, 4, 0],
		[5, 3, 3],
		[1, 2, 1],
	],
	[
		[0, 3, 3],
		[4, 2, 2],
		[5, 1, 1],
	],
	[
		[0, 2, 0],
		[3, 1, 1],
		[4, 5, 4],
	],
	[
		[0, 1, "F"],
		[2, 5, "live"],
		[3, 4, null],
	],
];

/** Placement, set wins & losses and map wins & losses of the round robin teams in order. */
const ROUND_ROBIN_STANDINGS = [
	[1, 3, 1, 7, 3],
	[2, 3, 1, 7, 4],
	[3, 3, 1, 6, 4],
	[4, 2, 2, 5, 5],
	[5, 1, 3, 3, 6],
	[6, 0, 4, 1, 8],
];

/** Third round of five: pools by the record going in, the featured match in the best one. */
const SWISS_POOLS: Array<{
	wins: number;
	losses: number;
	matches: MockRound["matches"];
}> = [
	{
		wins: 2,
		losses: 0,
		matches: [
			[0, 1, "F"],
			[2, 3, "live"],
		],
	},
	{
		wins: 1,
		losses: 1,
		matches: [
			[4, 5, 4],
			[6, 7, "live"],
			[8, 9, null],
			[10, 11, 11],
		],
	},
	{
		wins: 0,
		losses: 2,
		matches: [
			[12, 13, null],
			[14, 15, 15],
		],
	},
];

/**
 * A broadcast's whole state made up for the designer: the scene on air in the scenario's situation, with mock teams,
 * players, casters, brackets and other matches.
 */
export function build({
	scenario,
	tournament: realTournament,
	settings,
	takenAt,
}: {
	scenario: Scenario;
	/** The real tournament, the In The Zone logo standing in for its own if it has none (an empty `logoUrl`). */
	tournament: BroadcastState["tournament"];
	settings: BroadcastSettings;
	/** When the scene went on air, what starting soon counts down from. */
	takenAt: number;
}): BroadcastState {
	const tournament = withLogo(realTournament);
	const teams = mockTeams({ scenario, tournament });
	const match = mockMatch({ scenario, teams });
	const producer: ProducerState = {
		id: 1,
		scene: scenario.scene,
		swapSides: scenario.swapSides,
		transition: scenario.transition,
		bracketIdx: null,
		bracketFocus: scenario.bracketFocus,
		clipId: null,
		teamPick: "left",
		durationMs: scenario.scene === "starting" ? 5 * 60_000 : null,
		advance: "take",
	};
	const bracket = mockBracket({ scenario, teams, match });
	const spotlight = mockSpotlight({ scenario, teams, match });

	return {
		v: 1,
		takeId: 1,
		takenAt,
		live: producer,
		next: producer,
		queue: [],
		lastItemId: 1,
		liveResults: null,
		ink: scenario.ink
			? {
					key: scenario.ink,
					isFlipped: false,
					matchId: match.id,
					resultCount: match.progress.live.resultCount,
				}
			: null,
		settings: {
			...settings,
			headline: scenario.headline ? settings.headline || MOCK_HEADLINE : "",
		},
		casters: CASTERS.slice(0, scenario.casters),
		tournament,
		match,
		bracket: { live: bracket, next: bracket },
		team: { live: spotlight, next: spotlight },
		otherMatches: mockOtherMatches({ scenario, teams }),
		health: { sources: 0, scanners: 0 },
	};
}

function mockTeams({
	scenario,
	tournament,
}: {
	scenario: Scenario;
	tournament: BroadcastState["tournament"];
}): BroadcastTeam[] {
	const playerNames = PLAYER_NAMES[scenario.names];
	const hasRealNames = scenario.names === "typical";

	return TEAM_NAMES[scenario.names].map((name, teamIdx) => {
		const featured = FEATURED.includes(teamIdx)
			? FEATURED_TEAMS[FEATURED.indexOf(teamIdx)]
			: null;

		return {
			id: teamIdx + 1,
			name,
			logoUrl: logoUrlOf({ scenario, tournament, featured }),
			seed: scenario.seeds ? teamIdx + 1 : null,
			players: Array.from({ length: scenario.players }, (_, playerIdx) => {
				const userId = teamIdx * 100 + playerIdx + 1;
				const real = featured?.players[playerIdx];

				return {
					userId,
					name:
						real && hasRealNames
							? real.name
							: playerNames[(teamIdx * 4 + playerIdx) % playerNames.length],
					avatarUrl: real?.avatarUrl ?? null,
					weapons: real?.weapons ?? weaponsOf(userId),
					country: real ? real.country : COUNTRIES[userId % COUNTRIES.length],
				};
			}),
		};
	});
}

function withLogo(
	tournament: BroadcastState["tournament"],
): BroadcastState["tournament"] {
	const hasOwnLogo =
		tournament.logoUrl !== "" &&
		!tournament.logoUrl.endsWith(`/${Config.tournamentDefaultLogo}`);

	return hasOwnLogo
		? tournament
		: { ...tournament, logoUrl: FALLBACK_TOURNAMENT_LOGO };
}

function logoUrlOf({
	scenario,
	tournament,
	featured,
}: {
	scenario: Scenario;
	tournament: BroadcastState["tournament"];
	featured: (typeof FEATURED_TEAMS)[number] | null;
}) {
	if (!scenario.logos) return null;
	if (featured && !scenario.placeholderLogos) return featured.logoUrl;

	return tournament.logoUrl;
}

function weaponsOf(userId: number): MainWeaponId[] {
	return Array.from(
		{ length: (userId % 3) + 1 },
		(_, i) => mainWeaponIds[(userId * 7 + i * 13) % mainWeaponIds.length],
	);
}

function mapAt(gameIdx: number): BroadcastMap {
	return {
		mode: MODES[gameIdx % MODES.length],
		stageId: STAGES[gameIdx % STAGES.length],
	};
}

/** Winner (0 or 1) of each game played so far in the scenario's set. */
function playedGames(scenario: Scenario): Array<0 | 1> {
	const winsNeeded = Math.ceil(scenario.bestOf / 2);
	const alternating = (count: number) =>
		Array.from({ length: count }, (_, i) => (i % 2) as 0 | 1);

	switch (scenario.set) {
		case "start":
			return [];
		case "ongoing":
			return alternating(winsNeeded - 1);
		case "decider":
			return alternating((winsNeeded - 1) * 2);
		case "over":
			return [...alternating((winsNeeded - 1) * 2), 0];
	}
}

function mockMatch({
	scenario,
	teams,
}: {
	scenario: Scenario;
	teams: BroadcastTeam[];
}): BroadcastMatch {
	const teamIds: [number, number] = [
		teams[FEATURED[0]].id,
		teams[FEATURED[1]].id,
	];
	const winners = playedGames(scenario);
	const results = winners.map((winner, i) => ({
		winnerTeamId: teamIds[winner],
		...mapAt(i),
	}));
	const progress = SetProgress.atResultCount({
		results,
		resultCount: results.length,
		teamIds,
		bracketScores: [
			winners.filter((winner) => winner === 0).length,
			winners.filter((winner) => winner === 1).length,
		],
		isSetOver: scenario.set === "over",
		plannedMaps: Array.from({ length: scenario.bestOf }, (_, i) => mapAt(i)),
		gameCount: scenario.bestOf,
	});

	return {
		id: 1,
		bracketName: "Main bracket",
		roundName: featuredRoundName(scenario),
		countType: "BEST_OF",
		count: scenario.bestOf,
		teams: [teams[FEATURED[0]], teams[FEATURED[1]]],
		progress: { live: progress, next: progress },
	};
}

function featuredRoundName(scenario: Scenario) {
	switch (scenario.bracket) {
		case "double_elimination":
			return "WB Finals";
		case "single_elimination":
			return "Semifinals";
		case "round_robin":
			return "Round 5";
		case "swiss":
			return "Round 3";
	}
}

function mockBracket({
	scenario,
	teams,
	match,
}: {
	scenario: Scenario;
	teams: BroadcastTeam[];
	match: BroadcastMatch;
}): BroadcastBracket {
	const bracketMatches = (
		matches: MockRound["matches"],
		idPrefix: number,
		isFed: boolean,
	) =>
		matches.map((mock, i) =>
			mockBracketMatch({
				mock,
				id: idPrefix * 100 + i + 2,
				isFed,
				scenario,
				teams,
				progress: match.progress.live,
			}),
		);

	switch (scenario.bracket) {
		case "double_elimination":
		case "single_elimination": {
			const sides =
				scenario.bracket === "single_elimination"
					? [{ type: "winners" as const, rounds: SINGLE_ELIMINATION }]
					: (["winners", "losers"] as const)
							.filter(
								(type) =>
									scenario.bracketFocus === "remaining" ||
									scenario.bracketFocus === "whole" ||
									scenario.bracketFocus === type,
							)
							.map((type) => ({ type, rounds: DOUBLE_ELIMINATION[type] }));

			return {
				type: "elimination",
				idx: 0,
				name: "Main bracket",
				sides: sides.map(({ type, rounds }, sideIdx): BroadcastBracketSide => {
					const shown = rounds.filter(
						(round) =>
							scenario.bracketFocus === "whole" ||
							round.matches.some(([, , result]) => typeof result !== "number"),
					);
					const shownRounds = shown.map((round, roundIdx) => ({
						id: sideIdx * 10 + roundIdx + 1,
						name: round.name,
						connector: round.connector,
						matches: bracketMatches(
							round.matches,
							sideIdx * 10 + roundIdx,
							roundIdx > 0,
						),
					}));

					return {
						type,
						slotCount: Math.max(
							...shownRounds.map((round) => round.matches.length),
						),
						rounds: shownRounds,
					};
				}),
			};
		}
		case "round_robin":
			return {
				type: "round_robin",
				idx: 0,
				name: "Groups",
				groupNumber: 1,
				standings: [
					{
						hiddenAbove: 0,
						standings: ROUND_ROBIN_STANDINGS.map(
							(
								[placement, setWins, setLosses, mapWins, mapLosses],
								teamIdx,
							) => ({
								placement,
								team: bracketTeam(teams[teamIdx]),
								setWins,
								setLosses,
								mapWins,
								mapLosses,
							}),
						),
					},
				],
				standingsHiddenBelow: 0,
				rounds: ROUND_ROBIN.map((matches, roundIdx) => ({
					id: roundIdx + 1,
					number: roundIdx + 1,
					matches: bracketMatches(matches, roundIdx, false),
				})),
			};
		case "swiss":
			return {
				type: "swiss",
				idx: 0,
				name: "Swiss",
				groupNumber: null,
				standings: [
					{
						hiddenAbove: 0,
						standings: teams.map((team, teamIdx) => {
							const wins = teamIdx < 4 ? 2 : teamIdx < 12 ? 1 : 0;

							return {
								placement: teamIdx + 1,
								team: bracketTeam(team),
								setWins: wins,
								setLosses: 2 - wins,
								mapWins: wins * 3 + ((15 - teamIdx) % 3),
								mapLosses: (2 - wins) * 3 + (teamIdx % 2),
							};
						}),
					},
				],
				standingsHiddenBelow: 0,
				roundNumber: 3,
				roundCount: 5,
				pools: SWISS_POOLS.map((pool, poolIdx) => ({
					wins: pool.wins,
					losses: pool.losses,
					matches: bracketMatches(pool.matches, poolIdx, false),
				})),
			};
	}
}

function mockBracketMatch({
	mock: [first, second, result],
	id,
	isFed,
	scenario,
	teams,
	progress,
}: {
	mock: MockRound["matches"][number];
	id: number;
	isFed: boolean;
	scenario: Scenario;
	teams: BroadcastTeam[];
	progress: MatchProgress;
}): BroadcastBracketMatch {
	const winsNeeded = Math.ceil(scenario.bestOf / 2);
	const matchTeams: BroadcastBracketMatch["teams"] = [
		first === null ? null : bracketTeam(teams[first]),
		second === null ? null : bracketTeam(teams[second]),
	];

	if (result === "F") {
		return {
			id: 1,
			teams: matchTeams,
			scores: progress.resultCount > 0 ? progress.scores : null,
			winner: SetProgress.winner(progress),
			isFeatured: true,
			isFed,
		};
	}

	const winner = result === first ? 0 : result === second ? 1 : null;

	return {
		id,
		teams: matchTeams,
		scores:
			winner !== null
				? winner === 0
					? [winsNeeded, id % winsNeeded]
					: [id % winsNeeded, winsNeeded]
				: result === "live"
					? [1, 1]
					: null,
		winner,
		isFeatured: false,
		isFed,
	};
}

function bracketTeam(team: BroadcastTeam): BroadcastBracketTeam {
	return {
		id: team.id,
		name: team.name,
		logoUrl: team.logoUrl,
		seed: team.seed,
	};
}

function mockSpotlight({
	scenario,
	teams,
	match,
}: {
	scenario: Scenario;
	teams: BroadcastTeam[];
	match: BroadcastMatch;
}): BroadcastTeamSpotlight {
	const featuredIdx = scenario.swapSides ? 1 : 0;
	const team = teams[FEATURED[featuredIdx]];
	const opponent = teams[FEATURED[1 - featuredIdx]];
	const progress = match.progress.live;
	const winner = SetProgress.winner(progress);
	const winsNeeded = Math.ceil(scenario.bestOf / 2);
	const pastSet = (opponentIdx: number, roundName: string, losses: number) => ({
		matchId: 100 + opponentIdx,
		roundLabel: `Main bracket · ${roundName}`,
		opponent: bracketTeam(teams[opponentIdx]),
		scores: [winsNeeded, losses] as [number, number],
		status: "win" as const,
		games: Array.from({ length: winsNeeded + losses }, (_, i) => ({
			...mapAt(i),
			isWin: i >= losses,
		})),
	});

	return {
		team,
		record: { setWins: 2, setLosses: 0, mapWins: 9, mapLosses: 3 },
		modes: [
			{ mode: "SZ", wins: 4, losses: 1 },
			{ mode: "TC", wins: 2, losses: 1 },
			{ mode: "RM", wins: 2, losses: 1 },
			{ mode: "CB", wins: 1, losses: 0 },
		],
		mapPool: Array.from({ length: 8 }, (_, i) => mapAt(i)),
		sets: [
			pastSet(7, "WB Round 1", 0),
			pastSet(3, "WB Semis", winsNeeded - 1),
			{
				matchId: match.id,
				roundLabel: `Main bracket · ${match.roundName}`,
				opponent: bracketTeam(opponent),
				scores: [
					progress.scores[featuredIdx],
					progress.scores[1 - featuredIdx],
				],
				status:
					winner === null ? "live" : winner === featuredIdx ? "win" : "loss",
				games: progress.games.flatMap((game) =>
					game.map && game.winner !== null
						? [{ ...game.map, isWin: game.winner === featuredIdx }]
						: [],
				),
			},
		],
	};
}

function mockOtherMatches({
	scenario,
	teams,
}: {
	scenario: Scenario;
	teams: BroadcastTeam[];
}): BroadcastOtherMatch[] {
	return Array.from({ length: scenario.otherMatches }, (_, i) => {
		const isOver = i % 3 === 2;

		return {
			id: 1000 + i,
			roundName: i % 2 === 0 ? "LB Round 2" : "WB Semis",
			teams: [
				teams[(2 + i * 2) % teams.length],
				teams[(3 + i * 2) % teams.length],
			],
			scores: isOver ? [Math.ceil(scenario.bestOf / 2), 1] : [i % 3, 1],
			winner: isOver ? 0 : null,
		};
	});
}
