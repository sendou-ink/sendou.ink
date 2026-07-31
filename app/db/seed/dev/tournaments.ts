import { sub } from "date-fns";
import type { TournamentSettings } from "~/db/tables-json";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import { BANNED_MAPS } from "~/features/match-profile/banned-maps";
import type { TournamentTierNumber } from "~/features/tournament/core/tiering";
import { rankedModesShort } from "~/modules/in-game-lists/modes";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { faker, unique } from "../core/faker";
import * as showcaseNames from "../core/showcaseNames";
import * as TournamentFactory from "../factories/TournamentFactory";
import * as TournamentLFGTeamFactory from "../factories/TournamentLFGTeamFactory";
import * as TournamentStreamerFactory from "../factories/TournamentStreamerFactory";
import * as TournamentTeamFactory from "../factories/TournamentTeamFactory";
import type { SeededBadges } from "./badges";
import type { SeededOrganization } from "./organizations";
import type { SeededTrophies } from "./trophies";
import type { SeededUsers } from "./users";

/** Series the played-out tournaments of the past are named off. The four the seed
 * puts in a state worth opening are named off a series of their own. */
const TOURNAMENT_NAME_STEMS = ["PICNIC", "The Depths", "Leagues Under The Ink"];

const HISTORICAL_COUNT = 5;
/** Showcase users seeded into every played tournament, so their results paginate. */
const CORE_PLAYER_COUNT = 8;

type Progression = TournamentSettings["bracketProgression"];

const DOUBLE_ELIMINATION: Progression = [
	{
		type: "double_elimination",
		name: "Main Bracket",
		requiresCheckIn: false,
		settings: {},
	},
];

const DOUBLE_ELIMINATION_WITH_UNDERGROUND: Progression = [
	...DOUBLE_ELIMINATION,
	{
		type: "single_elimination",
		name: "Underground Bracket",
		requiresCheckIn: false,
		settings: {},
		sources: [{ bracketIdx: 0, placements: [-1, -2] }],
	},
];

const SINGLE_ELIMINATION: Progression = [
	{
		type: "single_elimination",
		name: "Bracket",
		requiresCheckIn: false,
		settings: { thirdPlaceMatch: true },
	},
];

const ROUND_ROBIN_TO_SINGLE_ELIMINATION: Progression = [
	{
		type: "round_robin",
		name: "Groups Stage",
		requiresCheckIn: false,
		settings: {},
	},
	{
		type: "single_elimination",
		name: "Final Stage",
		requiresCheckIn: false,
		settings: {},
		sources: [{ bracketIdx: 0, placements: [1, 2] }],
	},
];

const ROUND_ROBIN_TO_TOP_CUT_AND_LOWER: Progression = [
	...ROUND_ROBIN_TO_SINGLE_ELIMINATION,
	{
		type: "single_elimination",
		name: "Lower Bracket",
		requiresCheckIn: false,
		settings: {},
		sources: [{ bracketIdx: 0, placements: [3, 4] }],
	},
];

const SWISS_TO_SINGLE_ELIMINATION: Progression = [
	{
		type: "swiss",
		name: "Swiss",
		requiresCheckIn: false,
		settings: { groupCount: 1, roundCount: 4 },
	},
	{
		type: "single_elimination",
		name: "Top Cut",
		requiresCheckIn: false,
		settings: {},
		sources: [{ bracketIdx: 0, placements: [1, 2, 3, 4] }],
	},
];

export type SeededTournaments = {
	/** The one with registration still open, which the notifications are about. */
	regOpen: { id: number; name: string };
};

export async function seedTournaments({
	users,
	organizations,
	badges,
	trophies,
}: {
	users: SeededUsers;
	organizations: SeededOrganization[];
	badges: SeededBadges;
	trophies: SeededTrophies;
}): Promise<SeededTournaments> {
	const rosters = rosterBuilder(users);

	const inTheZone = await seedInTheZone({
		users,
		organizations,
		rosters,
		trophies,
	});
	await seedPaddlingPool({ users, organizations, rosters });
	await seedLowInk({ users, organizations, rosters });
	await seedSwimOrSink({ users, organizations, rosters });

	await seedHistoricalTournaments({
		users,
		organizations,
		badges,
		rosters,
		trophies,
	});

	return { regOpen: inTheZone };
}

type Ctx = {
	users: SeededUsers;
	organizations: SeededOrganization[];
	rosters: ReturnType<typeof rosterBuilder>;
};

/** #1 double elim, TO maps — reg open and a couple of days out, so it has both
 * registered teams (some of them still short of a full roster) and LFG teams. */
async function seedInTheZone({
	users,
	organizations,
	rosters,
	trophies,
}: Ctx & { trophies: SeededTrophies }) {
	const name = nameFor("In The Zone");

	const tournament = await TournamentFactory.create({
		name,
		authorId: users.adminId,
		organizationId: organizations[0]?.id,
		avatarFileName: "in-the-zone.png",
		startTimes: [dateToDatabaseTimestamp(daysFromNow(2))],
		mapPickingStyle: "TO",
		mapPoolMaps: toSetMapPool(),
		bracketProgression: DOUBLE_ELIMINATION,
		enableSubs: true,
		trophyId: trophies.ids[0],
	});

	const teamRosters = rosters.take({ teamCount: 10, teamSize: 4 });
	teamRosters[0].unshift(users.adminId);

	for (const [i, memberUserIds] of teamRosters.entries()) {
		await TournamentTeamFactory.create({
			tournamentId: tournament.id,
			team: fakeTeamProfile(),
			// not every registered roster is full while reg is still open
			memberUserIds: i % 3 === 2 ? memberUserIds.slice(0, 3) : memberUserIds,
			hasAvatar: i % 4 === 0,
		});
	}

	await seedTournamentExtras(tournament.id, users);

	return { id: tournament.id, name };
}

/** #2 double elim with an underground bracket, AUTO_SZ, ranked — bracket started,
 * not a single set reported yet. */
async function seedPaddlingPool({ users, rosters }: Ctx) {
	const tournament = await TournamentFactory.create({
		name: nameFor("Paddling Pool"),
		authorId: users.adminId,
		avatarFileName: "paddling-pool.png",
		startTimes: [dateToDatabaseTimestamp(hoursAgo(1))],
		mapPickingStyle: "AUTO_SZ",
		bracketProgression: DOUBLE_ELIMINATION_WITH_UNDERGROUND,
		isRanked: true,
	});

	const teamRosters = rosters.take({ teamCount: 12, teamSize: 4 });
	teamRosters[0].unshift(users.nzapId);

	await registerTeams({
		tournamentId: tournament.id,
		rosters: teamRosters,
		isCheckedIn: true,
		mapPool: () => counterpickMapPool("AUTO_SZ"),
	});

	await TournamentFactory.startBracket(tournament.id);
}

/** #3 swiss → SE, TO maps — swiss played to the end, the top cut waiting to be started. */
async function seedLowInk({ users, rosters }: Ctx) {
	const tournament = await TournamentFactory.create({
		name: nameFor("Low Ink"),
		authorId: users.adminId,
		startTimes: [dateToDatabaseTimestamp(hoursAgo(4))],
		mapPickingStyle: "TO",
		mapPoolMaps: toSetMapPool(),
		bracketProgression: SWISS_TO_SINGLE_ELIMINATION,
		swissGroupCount: 1,
		swissRoundCount: 4,
	});

	const teamRosters = rosters.take({ teamCount: 8, teamSize: 4 });
	teamRosters[0].unshift(users.nzapId);

	await registerTeams({
		tournamentId: tournament.id,
		rosters: teamRosters,
		isCheckedIn: true,
	});

	await TournamentFactory.playOut(tournament.id, 0);
}

/** #4 round robin → SE, TO maps — everybody checked in, first bracket not started. */
async function seedSwimOrSink({ users, rosters }: Ctx) {
	const tournament = await TournamentFactory.create({
		name: nameFor("Swim or Sink"),
		authorId: users.adminId,
		avatarFileName: "swim-or-sink.png",
		startTimes: [dateToDatabaseTimestamp(hoursAgo(1))],
		mapPickingStyle: "TO",
		mapPoolMaps: toSetMapPool(),
		bracketProgression: ROUND_ROBIN_TO_SINGLE_ELIMINATION,
		teamsPerGroup: 4,
	});

	const teamRosters = rosters.take({ teamCount: 12, teamSize: 4 });
	teamRosters[0].unshift(users.nzapId);

	await registerTeams({
		tournamentId: tournament.id,
		rosters: teamRosters,
		isCheckedIn: true,
	});
}

async function seedHistoricalTournaments({
	users,
	badges,
	rosters,
	trophies,
}: Ctx & { badges: SeededBadges; trophies: SeededTrophies }) {
	for (let i = 0; i < HISTORICAL_COUNT; i++) {
		const progression = faker.helpers.weightedArrayElement([
			{ value: DOUBLE_ELIMINATION, weight: 5 },
			{ value: ROUND_ROBIN_TO_SINGLE_ELIMINATION, weight: 3 },
			{ value: SINGLE_ELIMINATION, weight: 1 },
			{ value: DOUBLE_ELIMINATION_WITH_UNDERGROUND, weight: 1 },
			{ value: ROUND_ROBIN_TO_TOP_CUT_AND_LOWER, weight: 1 },
		]);
		// recent ones ranked and within the front page's week-long results window
		const isRecent = i < 3;
		const startsAt = isRecent
			? sub(new Date(), { days: 1 + i, hours: 3 })
			: sub(new Date(), { months: 1 + (i % 8), days: (i * 7) % 28 });
		const badgeId = i % 3 === 0 ? badges.ids[i % badges.ids.length] : undefined;

		const tournament = await TournamentFactory.create(
			{
				name: nameFor(TOURNAMENT_NAME_STEMS[i % TOURNAMENT_NAME_STEMS.length]),
				authorId: faker.helpers.arrayElement(users.showcaseIds),
				startTimes: [dateToDatabaseTimestamp(startsAt)],
				mapPickingStyle: isRecent ? "AUTO_SZ" : "AUTO_ALL",
				mapPoolMaps: isRecent ? undefined : tiebreakerMapPool(),
				bracketProgression: progression,
				teamsPerGroup: 4,
				isRanked: isRecent,
				badges: badgeId ? [badgeId] : [],
				trophyId: trophies.ids[i % trophies.ids.length],
			},
			{ tier: ((i % 3) + 1) as TournamentTierNumber },
		);

		const teamRosters = rosters.take({ teamCount: 8, teamSize: 4 });
		// on the top seed of the first one, so that a win of his is finalized, and
		// further down another, so his result list is not all first places
		if (i === 0) {
			teamRosters[0].unshift(users.nzapId);
		} else if (i === 2) {
			teamRosters[5].unshift(users.nzapId);
		}

		await registerTeams({
			tournamentId: tournament.id,
			rosters: teamRosters,
			isCheckedIn: true,
			registeredAt: sub(startsAt, { days: 2 }),
			mapPool: () => counterpickMapPool(isRecent ? "AUTO_SZ" : "AUTO_ALL"),
		});

		await TournamentFactory.playOut(tournament.id, "all");
	}
}

async function seedTournamentExtras(tournamentId: number, users: SeededUsers) {
	for (const twitchAccount of ["sendou", "nzap_stream"]) {
		await TournamentStreamerFactory.create({ tournamentId, twitchAccount });
	}

	const lfgUserIds = [users.nzapId, ...users.showcaseIds.slice(90, 95)];

	const lfgTeamIds: number[] = [];
	for (const [i, userId] of lfgUserIds.entries()) {
		const team = await TournamentLFGTeamFactory.create(
			{ tournamentId, userId },
			{ likedTeamIds: lfgTeamIds.slice(0, i % 3) },
		);
		lfgTeamIds.push(team.id);
	}
}

async function registerTeams({
	tournamentId,
	rosters,
	isCheckedIn,
	registeredAt,
	mapPool,
}: {
	tournamentId: number;
	rosters: number[][];
	isCheckedIn?: boolean;
	registeredAt?: Date;
	mapPool?: () => MapPool;
}) {
	const teams = [];
	for (const [i, memberUserIds] of rosters.entries()) {
		teams.push(
			await TournamentTeamFactory.create(
				{
					tournamentId,
					team: fakeTeamProfile(),
					memberUserIds,
					mapPool: mapPool?.(),
					registeredAt,
					hasAvatar: i % 5 === 0,
				},
				{ isCheckedIn },
			),
		);
	}

	return teams;
}

function rosterBuilder(users: SeededUsers) {
	const corePlayers = users.showcaseIds.slice(0, CORE_PLAYER_COUNT);
	const pool = [
		...users.showcaseIds.slice(CORE_PLAYER_COUNT),
		...users.crowdIds.slice(0, 300),
	];

	return {
		/** Rosters for one tournament: core players spread over the first teams, the
		 * rest drawn without replacement within the tournament. */
		take({ teamCount, teamSize }: { teamCount: number; teamSize: number }) {
			const shuffled = faker.helpers.shuffle(pool);

			return Array.from({ length: teamCount }, (_, i) => {
				const roster: number[] = [];
				if (teamSize >= 2 && i < corePlayers.length) {
					roster.push(corePlayers[i]);
				}

				while (roster.length < teamSize) {
					roster.push(shuffled.pop()!);
				}

				return roster;
			});
		},
	};
}

function fakeTeamProfile() {
	return {
		name: unique(() => showcaseNames.teamName().slice(0, 64)),
		prefersNotToHost: faker.number.float(1) < 0.2 ? (1 as const) : (0 as const),
		teamId: null,
	};
}

/** Series name and the edition of it this tournament is, as they are named. */
function nameFor(stem: string) {
	return `${stem} ${faker.number.int({ min: 2, max: 120 })}`;
}

function toSetMapPool() {
	return mapsPerMode(7);
}

function tiebreakerMapPool() {
	return mapsPerMode(1);
}

function mapsPerMode(count: number) {
	return rankedModesShort.flatMap((mode) =>
		legalStages(mode)
			.slice(0, count)
			.map((stageId) => ({ mode, stageId })),
	);
}

function counterpickMapPool(style: "AUTO_SZ" | "AUTO_ALL") {
	const pairs =
		style === "AUTO_SZ"
			? faker.helpers
					.arrayElements(legalStages("SZ"), 6)
					.map((stageId) => ({ mode: "SZ" as const, stageId }))
			: rankedModesShort.flatMap((mode) =>
					faker.helpers
						.arrayElements(legalStages(mode), 2)
						.map((stageId) => ({ mode, stageId })),
				);

	return new MapPool(pairs);
}

function legalStages(mode: ModeShort): StageId[] {
	return stageIds.filter((stageId) => !BANNED_MAPS[mode].includes(stageId));
}

function daysFromNow(days: number) {
	return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function hoursAgo(hours: number) {
	return new Date(Date.now() - hours * 60 * 60 * 1000);
}
