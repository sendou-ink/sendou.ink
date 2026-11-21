import { Config } from "~/config";
import type {
	BroadcastMap,
	BroadcastMatch,
	BroadcastScannedGame,
	BroadcastStingerVariant,
	BroadcastTeam,
	MatchProgress,
} from "~/features/broadcast/broadcast-types";
import { broadcastDesignImageUrl } from "~/features/broadcast/broadcast-urls";
import * as SetProgress from "~/features/broadcast/core/SetProgress";
import type {
	Ability,
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import { mainWeaponIds } from "~/modules/in-game-lists/weapon-ids";
import type { SearchParamsValues } from "~/modules/search-params/search-params";
import type { broadcastDesignSearchParams } from "../broadcast-cast-search-params";
import type {
	BroadcastBracket,
	BroadcastBracketMatch,
	BroadcastBracketRound,
	BroadcastBracketSide,
	BroadcastBracketSidesFocus,
	BroadcastBracketTeam,
	BroadcastCaster,
	BroadcastOtherMatch,
	BroadcastTeamSpotlight,
	CastBroadcastSettings,
	CastBroadcastState,
	CastProducerState,
} from "../broadcast-cast-types";

/** The designer's mock scenario, see `broadcastDesignSearchParams`. */
export type Scenario = Omit<
	SearchParamsValues<typeof broadcastDesignSearchParams.shape>,
	"footage"
>;

/** The producer's per side bracket focus each of the designer's focuses stands for. */
const BRACKET_SIDES: Record<
	Scenario["bracketFocus"],
	BroadcastBracketSidesFocus
> = {
	remaining: { winners: "remaining", losers: "remaining" },
	winners: { winners: "remaining", losers: "hidden" },
	losers: { winners: "hidden", losers: "remaining" },
	whole: { winners: 0, losers: 0 },
};

/**
 * Made up in the manner of the names teams really go by: lowercase, in-jokes, a sentence, other languages. The first
 * two of `typical` are the {@link FEATURED_TEAMS}.
 */
const TEAM_NAMES = {
	short: [
		"Kiwi",
		"JPG",
		"idk",
		"Nyx",
		":3",
		"ZZZ",
		"nya~",
		"Vex",
		"RNG",
		"#9",
		"Opal",
		"oops.",
		"yo",
		"ECHO",
		"Fig",
		"404",
	],
	typical: [
		"Moonlight",
		"Team Olive",
		"Soggy Waffles",
		"last minute",
		"Nightshift",
		"Bread Club™",
		"Cold Leftovers",
		"Sunny Side Up",
		"NO NOTES?",
		"Crème de Menthe",
		"afk brb",
		"Paper Lanterns",
		"ULTRAMARINE",
		"Tuesday People",
		"Gouda Vibes",
		"Orange Soda",
	],
	long: [
		"May the bus wait for us",
		"I paused my show to be here",
		"50% espresso 50% regret",
		"Graphing Calculator Enjoyers",
		"three raccoons in a trench coat (part 2)",
		"DM me for the group project",
		"Something Soggy This Way Comes",
		"we forgot to pick a name again",
		"Emergency Snack Committee",
		"Kleiner Kaktus Fanclub e.V.",
		"estamos baneados de la cafetería",
		"NEVER BACK UP NEVER WHAT",
		"Left-Handed Scissors Union Local 4",
		"Hello Kitty Overtime Hours",
		"Northfield Community College B Team",
		"the team formerly known as idk",
	],
} as const;

/** Made up in the manner of the names players really go by, see {@link TEAM_NAMES}. */
const PLAYER_NAMES = {
	short: [
		"Ari",
		"ko",
		"みお",
		"Pip",
		"jk",
		"Ro",
		"uwu",
		"Sal",
		"ねこ",
		"Bex",
		"tk",
		"Oz",
		"9",
		"Mei",
		"vi",
		"🦐",
	],
	typical: [
		"marzi",
		"toastt",
		"K1wi",
		"Ellie<3",
		"うどん",
		"Mr_Plum",
		"nachtfalter",
		"Jun★",
		"dubs22",
		"Pascal",
		"saltyy",
		"Tobi♪",
		"Lune",
		"g0ose",
		"Rafa_07",
		"cinnabun",
	],
	long: [
		"Lukewarm Lemonade",
		"pretzel14 [Pretz]",
		"MARLO (on break, read bio)",
		"Captain Soup TAKE OFF!",
		"definitely not an alt acc",
		"Nico ~ SW-0000-0000-0000 ~",
		"Biscuit The Tax Evader",
		"*distant microwave noises*",
		"Average Soup Enjoyer",
		"Camille / pain aux raisins",
		"SockDrawer09(grounded)",
		"Sir Reginald Fluffington III",
		"ʚ mochi / ezra ɞ",
		"too-many-umbrellas ☂",
		"Grandma's WiFi Password",
		"ꜱᴍᴀʟʟ ᴄᴀᴘꜱ ᴇɴᴊᴏʏᴇʀ",
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

/**
 * The first one's camera shows as the placeholder the overlay has outside OBS, the second one is audio only. Their
 * pronouns and user page URLs cover each case: both taking turns, only a URL and only pronouns.
 */
const CASTERS: BroadcastCaster[] = [
	{
		userId: 1,
		name: "Lean",
		pronouns: { subject: "he", object: "him" },
		customUrl: "lean",
		avatarUrl: broadcastDesignImageUrl("mock/avatars/shadowind.webp"),
		vdoNinjaUrl: "https://vdo.ninja/?view=lean",
		isAudioOnly: false,
		volume: 100,
	},
	{
		userId: 2,
		name: "Sendou",
		pronouns: null,
		customUrl: "sendou",
		avatarUrl: broadcastDesignImageUrl("mock/avatars/basil.webp"),
		vdoNinjaUrl: "https://vdo.ninja/?view=sendou",
		isAudioOnly: true,
		volume: 100,
	},
	{
		userId: 3,
		name: "Brie",
		pronouns: { subject: "she", object: "her" },
		customUrl: null,
		avatarUrl: broadcastDesignImageUrl("mock/avatars/omega.webp"),
		vdoNinjaUrl: "https://vdo.ninja/?view=brie",
		isAudioOnly: false,
		volume: 100,
	},
];

/** Counter reads of the game the results scene shows: seconds into the game, the teams' counts, who held the objective. */
const MOCK_OBJECTIVE: Array<[number, number, number, 0 | 1 | null]> = [
	[0, 100, 100, null],
	[10, 100, 100, null],
	[20, 100, 100, 0],
	[30, 92, 100, 0],
	[40, 84, 100, 0],
	[50, 76, 100, 0],
	[60, 70, 100, 1],
	[70, 70, 94, 1],
	[80, 70, 86, 1],
	[90, 70, 78, 1],
	[100, 70, 72, null],
	[110, 70, 72, 0],
	[120, 63, 72, 0],
	[130, 55, 72, 0],
	[140, 47, 72, 0],
	[150, 40, 72, 0],
	[160, 36, 72, null],
	[170, 36, 72, 1],
	[180, 36, 64, 1],
	[190, 36, 57, 1],
	[200, 36, 50, 1],
	[210, 36, 45, null],
	[220, 36, 45, 0],
	[230, 29, 45, 0],
	[240, 22, 45, 0],
	[250, 16, 45, 0],
	[260, 14, 45, 1],
	[270, 14, 41, 1],
	[280, 14, 41, null],
	[290, 12, 41, 0],
	[300, 12, 41, 0],
];

/** Main abilities of the players of the game the results scene shows, in turn. */
const MOCK_ABILITIES: Ability[][] = [
	["LDE", "RSU", "SJ"],
	["CB", "ISM", "SJ"],
	["LDE", "SSU", "OS"],
	["OG", "NS", "SSU"],
	["LDE", "RP", "SJ"],
	["CB", "RSU", "SJ"],
	["LDE", "QR", "SJ"],
	["ISM", "SPU", "SJ"],
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

/** The stinger the scenario's transition previews, whichever scenes it goes between. */
export function stingerOf(
	scenario: Pick<Scenario, "transition">,
): BroadcastStingerVariant {
	return scenario.transition === "tournamentStinger" ? "tournament" : "teams";
}

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
	tournament: CastBroadcastState["tournament"];
	settings: CastBroadcastSettings;
	/** When the scene went on air, what starting soon counts down from. */
	takenAt: number;
}): CastBroadcastState {
	const tournament = withLogo(realTournament);
	const teams = mockTeams({ scenario, tournament });
	const match = mockMatch({ scenario, teams });
	const producer: CastProducerState = {
		id: 1,
		scene: scenario.scene,
		swapSides: scenario.swapSides,
		transition:
			scenario.transition === "fade" || scenario.transition === "cut"
				? scenario.transition
				: "stinger",
		bracketIdx: null,
		bracketSides: BRACKET_SIDES[scenario.bracketFocus],
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
					matchId: match.id,
					resultCount: match.progress.live.resultCount,
				}
			: null,
		scannedGame: mockScannedGame({ match, ink: scenario.ink }),
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
	tournament: CastBroadcastState["tournament"];
}): BroadcastTeam[] {
	return TEAM_NAMES.typical.map((_name, teamIdx) => {
		const nameLength = nameLengthOf({ scenario, teamIdx });
		const playerNames = PLAYER_NAMES[nameLength];
		const hasRealNames = nameLength === "typical";
		const featured = FEATURED.includes(teamIdx)
			? FEATURED_TEAMS[FEATURED.indexOf(teamIdx)]
			: null;

		return {
			id: teamIdx + 1,
			name: TEAM_NAMES[nameLength][teamIdx],
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

/** With `mixed` names the featured match is a long name against a typical one, and so on down the teams. */
function nameLengthOf({
	scenario,
	teamIdx,
}: {
	scenario: Scenario;
	teamIdx: number;
}): keyof typeof TEAM_NAMES {
	if (scenario.names !== "mixed") return scenario.names;

	return teamIdx % 2 === 0 ? "long" : "typical";
}

function withLogo(
	tournament: CastBroadcastState["tournament"],
): CastBroadcastState["tournament"] {
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
	tournament: CastBroadcastState["tournament"];
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

/** The game the results scene shows as the scanner read it: the one being played, or the last one of a set that's over. */
function mockScannedGame({
	match,
	ink,
}: {
	match: BroadcastMatch;
	ink: Scenario["ink"];
}): BroadcastScannedGame {
	const { progress } = match;
	const resultCount = progress.live.isOver
		? progress.live.resultCount - 1
		: progress.live.resultCount;
	const map = mapAt(resultCount);
	const team = (idx: 0 | 1) => ({
		players: (match.teams[idx]?.players ?? [])
			.slice(0, 4)
			.map((player, playerIdx) => ({
				name: player.name,
				weaponSplId: player.weapons[0] ?? null,
				abilities:
					MOCK_ABILITIES[(idx * 4 + playerIdx) % MOCK_ABILITIES.length],
			})),
	});

	return {
		matchId: match.id,
		resultCount,
		ink: ink ? { key: ink } : null,
		mode: map.mode,
		stageId: map.stageId,
		isKnockout: false,
		winner: null,
		inks: [null, null],
		teams: [team(0), team(1)],
		objective: MOCK_OBJECTIVE.map(([t, alpha, bravo, control]) => ({
			t,
			score: [alpha, bravo],
			control,
		})),
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
