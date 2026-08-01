import { addHours, subMinutes } from "date-fns";
import type { TournamentSettings } from "~/db/tables-json";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import type { TournamentTierNumber } from "~/features/tournament/core/tiering";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import invariant from "~/utils/invariant";
import type { Factories } from "./factories";

export const ROSTER_SIZE = 4;

type BracketProgression = TournamentSettings["bracketProgression"];

export const DOUBLE_ELIMINATION: BracketProgression = [
	{
		type: "double_elimination",
		name: "Main bracket",
		requiresCheckIn: false,
		settings: {},
	},
];

/* Single group of 4 teams plays: R1 = matches 1 (team 1 vs. 4) & 2 (team 3 vs. 2),
 * R2 = matches 3 (team 2 vs. 4) & 4 (team 1 vs. 3), R3 = matches 5 & 6 (team 2 vs. 1). */
export const ROUND_ROBIN: BracketProgression = [
	{
		type: "round_robin",
		name: "Groups stage",
		requiresCheckIn: false,
		settings: {},
	},
];

export const RR_TO_SE: BracketProgression = [
	{
		type: "round_robin",
		name: "Groups stage",
		requiresCheckIn: false,
		settings: {},
	},
	{
		type: "single_elimination",
		name: "Final stage",
		requiresCheckIn: false,
		settings: {},
		sources: [{ bracketIdx: 0, placements: [1, 2] }],
	},
];

export const RR_TO_SE_WITH_UNDERGROUND: BracketProgression = [
	...RR_TO_SE,
	{
		type: "single_elimination",
		name: "Underground bracket",
		requiresCheckIn: true,
		settings: {},
		sources: [{ bracketIdx: 0, placements: [3, 4] }],
	},
];

export const SOS_BRACKETS: BracketProgression = [
	{
		type: "round_robin",
		name: "Groups stage",
		requiresCheckIn: false,
		settings: {},
	},
	{
		type: "single_elimination",
		name: "Great White",
		requiresCheckIn: false,
		settings: {},
		sources: [{ bracketIdx: 0, placements: [1] }],
	},
	{
		type: "single_elimination",
		name: "Hammerhead",
		requiresCheckIn: false,
		settings: {},
		sources: [{ bracketIdx: 0, placements: [2] }],
	},
	{
		type: "single_elimination",
		name: "Mako",
		requiresCheckIn: false,
		settings: {},
		sources: [{ bracketIdx: 0, placements: [3] }],
	},
	{
		type: "single_elimination",
		name: "Lantern",
		requiresCheckIn: false,
		settings: {},
		sources: [{ bracketIdx: 0, placements: [4] }],
	},
];

export const SWISS_TO_TOP_CUT: BracketProgression = [
	{
		type: "swiss",
		name: "Swiss",
		requiresCheckIn: false,
		settings: { groupCount: 2, roundCount: 4 },
	},
	{
		type: "single_elimination",
		name: "Top Cut",
		requiresCheckIn: false,
		settings: { thirdPlaceMatch: false },
		sources: [{ bracketIdx: 0, placements: [1, 2, 3, 4] }],
	},
];

export const TO_MAP_POOL = ([1, 2, 3, 4, 6, 7, 8, 10] as StageId[]).flatMap(
	(stageId) =>
		(["SZ", "TC", "RM", "CB"] as ModeShort[]).map((mode) => ({
			mode,
			stageId,
		})),
);

export type TeamSeed = {
	/** Users put on the roster ahead of freshly created filler users. */
	members?: number[];
	rosterSize?: number;
	isCheckedIn?: boolean;
};

/** `count` checked in teams with full rosters of fresh users. */
export function teamSeeds(count: number): TeamSeed[] {
	return Array.from({ length: count }, () => ({}));
}

/** Registers a team per seed, named by seeding order ("Team 1", "Team 2", ...). */
export async function createTeams(
	factories: Factories,
	tournamentId: number,
	seeds: TeamSeed[],
) {
	const teams = [];
	for (const [i, seed] of seeds.entries()) {
		const presetMembers = seed.members ?? [];
		const rosterSize = seed.rosterSize ?? ROSTER_SIZE;
		const fillerUsers = await factories.UserFactory.createMany(
			rosterSize - presetMembers.length,
		);
		teams.push(
			await factories.TournamentTeamFactory.create(
				{
					tournamentId,
					team: {
						name: `Team ${i + 1}`,
						prefersNotToHost: 0 as const,
						teamId: null,
					},
					memberUserIds: [
						...presetMembers,
						...fillerUsers.map((user) => user.id),
					],
				},
				{ isCheckedIn: seed.isCheckedIn ?? true },
			),
		);
	}
	return teams;
}

/** A start time in the past: check-in is over and brackets can be started from the UI. */
export function startedTournamentTimes() {
	return [dateToDatabaseTimestamp(subMinutes(new Date(), 30))];
}

/**
 * A tournament running an unfinished match: two checked-in teams and the bracket
 * started, which is all it takes for both teams to be "in a match". The friend and
 * their teammate play the opponent, and every user given is on the roster it is
 * named for.
 */
export async function createInProgressMatch(
	factories: Factories,
	{
		name,
		friendId,
		teammateId,
		opponentId,
		tier,
	}: {
		name: string;
		friendId: number;
		teammateId?: number;
		opponentId?: number;
		tier?: TournamentTierNumber;
	},
) {
	const tournament = await factories.TournamentFactory.create(
		{
			authorId: ADMIN_ID,
			name,
			startTimes: startedTournamentTimes(),
		},
		{ tier },
	);

	const teams = await createTeams(factories, tournament.id, [
		{ members: [friendId, ...(teammateId ? [teammateId] : [])] },
		{ members: opponentId ? [opponentId] : [] },
	]);

	const [match] = await factories.TournamentFactory.startBracket(tournament.id);
	invariant(match, "Starting the bracket created no match");

	return { tournament, teams, matchId: match.id };
}

/** An upcoming tournament where the given user's team is looking for subs. */
export async function createSubSeekingTournament(
	factories: Factories,
	{ name, subId }: { name: string; subId: number },
) {
	const tournament = await factories.TournamentFactory.create({
		authorId: ADMIN_ID,
		name,
		startTimes: [dateToDatabaseTimestamp(addHours(new Date(), 2))],
	});

	await factories.TournamentTeamFactory.create(
		{ tournamentId: tournament.id, memberUserIds: [subId] },
		{ isLooking: true },
	);

	return { tournament };
}

/**
 * A tournament where the given user is waiting for their next match: three teams
 * in a single elimination bracket leave the top seed with a bye into the final,
 * whose other side is still being played for.
 */
export async function createTournamentWithByeTeam(
	factories: Factories,
	{ name, waitingUserId }: { name: string; waitingUserId: number },
) {
	const tournament = await factories.TournamentFactory.create({
		authorId: ADMIN_ID,
		name,
		startTimes: startedTournamentTimes(),
	});

	await createTeams(factories, tournament.id, [
		{ members: [waitingUserId] },
		{},
		{},
	]);

	await factories.TournamentFactory.startBracket(tournament.id);

	return { tournament };
}
