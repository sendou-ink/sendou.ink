import { sub } from "date-fns";
import type { TournamentSettings } from "~/db/tables-json";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import { BANNED_MAPS } from "~/features/match-profile/banned-maps";
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
import type { SeededUsers } from "./users";

// xxx: rethink what should be here

const TOURNAMENT_NAME_STEMS = [
	"PICNIC",
	"Paddling Pool",
	"In The Zone",
	"The Depths",
	"Swim or Sink",
	"Leagues Under The Ink",
];

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

export async function seedTournaments({
	users,
	organizations,
	badges,
}: {
	users: SeededUsers;
	organizations: SeededOrganization[];
	badges: SeededBadges;
}) {
	const rosters = rosterBuilder(users);

	await seedRegOpenDoubleElim({ users, organizations, rosters });
	await seedRegClosedRoundRobin({ users, organizations, rosters });
	await seedMidBracketDoubleElim({ users, organizations, rosters });
	await seedSwissUnderway({ users, organizations, rosters });
	await seedPlayedAwaitingFinalization({ users, organizations, rosters });
	await seedFinalizedSingleElim({ users, organizations, badges, rosters });
	await seedFinalizedRoundRobin({ users, organizations, rosters });
	await seedRegOpenOneVersusOne({ users });
	await seedFinalizedTwoVersusTwo({ users, organizations, rosters });
	await seedInvitational({ users, rosters });

	await seedHistoricalTournaments({ users, organizations, badges, rosters });
}

type Ctx = {
	users: SeededUsers;
	organizations: SeededOrganization[];
	rosters: ReturnType<typeof rosterBuilder>;
};

/** #1 double elim, 16-team cap, TO maps — reg open, partial rosters. */
async function seedRegOpenDoubleElim({ users, organizations, rosters }: Ctx) {
	const tournament = await TournamentFactory.create({
		name: nameFor(0),
		authorId: users.adminId,
		organizationId: organizations[0]?.id,
		avatarFileName: "picnic.png",
		startTimes: [dateToDatabaseTimestamp(daysFromNow(2))],
		mapPickingStyle: "TO",
		mapPoolMaps: toSetMapPool(),
		bracketProgression: DOUBLE_ELIMINATION,
		enableSubs: true,
	});

	const teamRosters = rosters.take({ teamCount: 10, teamSize: 4 });
	teamRosters[0].unshift(users.adminId);
	teamRosters[1].unshift(users.nzapId);

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
}

/** #2 round robin → top cut + lower, TO maps — reg closed, bracket not started. */
async function seedRegClosedRoundRobin({ users, rosters }: Ctx) {
	const tournament = await TournamentFactory.create({
		name: nameFor(1),
		authorId: users.adminId,
		avatarFileName: "paddling-pool.png",
		startTimes: [dateToDatabaseTimestamp(hoursAgo(1))],
		mapPickingStyle: "TO",
		mapPoolMaps: toSetMapPool(),
		bracketProgression: ROUND_ROBIN_TO_TOP_CUT_AND_LOWER,
		teamsPerGroup: 4,
	});

	await registerTeams({
		tournamentId: tournament.id,
		rosters: rosters.take({ teamCount: 12, teamSize: 4 }),
		isCheckedIn: true,
	});
}

/** #3 double elim, AUTO_SZ, ranked — a round or two played, matches in progress. */
async function seedMidBracketDoubleElim({ users, rosters }: Ctx) {
	const tournament = await TournamentFactory.create({
		name: nameFor(2),
		authorId: users.adminId,
		avatarFileName: "in-the-zone.png",
		startTimes: [dateToDatabaseTimestamp(hoursAgo(2))],
		mapPickingStyle: "AUTO_SZ",
		bracketProgression: DOUBLE_ELIMINATION,
		isRanked: true,
	});

	const teamRosters = rosters.take({ teamCount: 12, teamSize: 4 });
	teamRosters[0].unshift(users.adminId);
	teamRosters[1].unshift(users.nzapId);

	await registerTeams({
		tournamentId: tournament.id,
		rosters: teamRosters,
		isCheckedIn: true,
		mapPool: () => counterpickMapPool("AUTO_SZ"),
	});

	await TournamentFactory.startBracket(tournament.id);
	await TournamentFactory.playMatches(tournament.id);
}

/** #4 swiss → SE, TO maps — swiss underway. */
async function seedSwissUnderway({ users, rosters }: Ctx) {
	const tournament = await TournamentFactory.create({
		name: nameFor(3),
		authorId: users.adminId,
		avatarFileName: "the-depths.png",
		startTimes: [dateToDatabaseTimestamp(hoursAgo(2))],
		mapPickingStyle: "TO",
		mapPoolMaps: toSetMapPool(),
		bracketProgression: SWISS_TO_SINGLE_ELIMINATION,
		swissGroupCount: 1,
		swissRoundCount: 4,
	});

	await registerTeams({
		tournamentId: tournament.id,
		rosters: rosters.take({ teamCount: 8, teamSize: 4 }),
		isCheckedIn: true,
	});

	await TournamentFactory.startBracket(tournament.id);
	await TournamentFactory.playMatches(tournament.id);
}

/** #5 double elim, 8 teams, AUTO_ALL — fully played, awaiting finalization. */
async function seedPlayedAwaitingFinalization({ users, rosters }: Ctx) {
	const tournament = await TournamentFactory.create({
		name: nameFor(4),
		authorId: users.adminId,
		avatarFileName: "swim-or-sink.png",
		startTimes: [dateToDatabaseTimestamp(hoursAgo(4))],
		mapPickingStyle: "AUTO_ALL",
		mapPoolMaps: tiebreakerMapPool(),
		bracketProgression: DOUBLE_ELIMINATION,
	});

	await registerTeams({
		tournamentId: tournament.id,
		rosters: rosters.take({ teamCount: 8, teamSize: 4 }),
		isCheckedIn: true,
		mapPool: () => counterpickMapPool("AUTO_ALL"),
	});

	await playOut(tournament.id, DOUBLE_ELIMINATION);
}

/** #6 single elim with third place match, TO maps — finalized, badge awarded. */
async function seedFinalizedSingleElim({
	users,
	badges,
	rosters,
}: Ctx & { badges: SeededBadges }) {
	const badgeId = badges.ids[0];

	const tournament = await TournamentFactory.create({
		name: nameFor(5),
		authorId: users.adminId,
		avatarFileName: "luti.png",
		startTimes: [dateToDatabaseTimestamp(hoursAgo(6))],
		mapPickingStyle: "TO",
		mapPoolMaps: toSetMapPool(),
		bracketProgression: SINGLE_ELIMINATION,
		thirdPlaceMatch: true,
		badges: [badgeId],
	});

	const teams = await registerTeams({
		tournamentId: tournament.id,
		rosters: rosters.take({ teamCount: 8, teamSize: 4 }),
		isCheckedIn: true,
	});

	const winnerTeamId = await playOut(tournament.id, SINGLE_ELIMINATION);
	const winners = teams.find((team) => team.id === winnerTeamId);

	await TournamentFactory.finalize(tournament.id, {
		badgeReceivers: winners
			? [
					{
						badgeId,
						tournamentTeamId: winners.id,
						userIds: winners.memberUserIds,
					},
				]
			: undefined,
	});
}

/** #7 round robin → SE, AUTO_SZ, ranked — finalized. */
async function seedFinalizedRoundRobin({ users, rosters }: Ctx) {
	const tournament = await TournamentFactory.create({
		name: nameFor(6),
		authorId: users.adminId,
		startTimes: [dateToDatabaseTimestamp(daysAgo(1))],
		mapPickingStyle: "AUTO_SZ",
		bracketProgression: ROUND_ROBIN_TO_SINGLE_ELIMINATION,
		teamsPerGroup: 4,
		isRanked: true,
	});

	await registerTeams({
		tournamentId: tournament.id,
		rosters: rosters.take({ teamCount: 8, teamSize: 4 }),
		isCheckedIn: true,
		mapPool: () => counterpickMapPool("AUTO_SZ"),
	});

	await playOut(tournament.id, ROUND_ROBIN_TO_SINGLE_ELIMINATION);
	await TournamentFactory.finalize(tournament.id);
}

/** #8 1v1 — reg open, exercises small-roster registration UI. */
async function seedRegOpenOneVersusOne({ users }: Pick<Ctx, "users">) {
	const tournament = await TournamentFactory.create({
		name: nameFor(7),
		authorId: users.adminId,
		startTimes: [dateToDatabaseTimestamp(daysFromNow(1))],
		mapPickingStyle: "AUTO_ALL",
		mapPoolMaps: tiebreakerMapPool(),
		bracketProgression: DOUBLE_ELIMINATION,
		minMembersPerTeam: 1,
	});

	for (const userId of users.showcaseIds.slice(20, 36)) {
		await TournamentTeamFactory.create({
			tournamentId: tournament.id,
			team: fakeTeamProfile(),
			memberUserIds: [userId],
		});
	}
}

/** #9 2v2, AUTO_SZ — finalized. */
async function seedFinalizedTwoVersusTwo({ users, rosters }: Ctx) {
	const tournament = await TournamentFactory.create({
		name: nameFor(8),
		authorId: users.adminId,
		startTimes: [dateToDatabaseTimestamp(daysAgo(2))],
		mapPickingStyle: "AUTO_SZ",
		bracketProgression: SINGLE_ELIMINATION,
		minMembersPerTeam: 2,
	});

	await registerTeams({
		tournamentId: tournament.id,
		rosters: rosters.take({ teamCount: 8, teamSize: 2 }),
		isCheckedIn: true,
		mapPool: () => counterpickMapPool("AUTO_SZ"),
	});

	await playOut(tournament.id, SINGLE_ELIMINATION);
	await TournamentFactory.finalize(tournament.id);
}

/** #10 invitational double elim, TO maps — pre-bracket, no open reg. */
async function seedInvitational({
	users,
	rosters,
}: Pick<Ctx, "users" | "rosters">) {
	const tournament = await TournamentFactory.create({
		name: nameFor(9),
		authorId: users.adminId,
		startTimes: [dateToDatabaseTimestamp(hoursAgo(1))],
		mapPickingStyle: "TO",
		mapPoolMaps: toSetMapPool(),
		bracketProgression: DOUBLE_ELIMINATION,
		isInvitational: true,
	});

	await registerTeams({
		tournamentId: tournament.id,
		rosters: rosters.take({ teamCount: 8, teamSize: 4 }),
		isCheckedIn: true,
	});
}

async function seedHistoricalTournaments({
	users,
	badges,
	rosters,
}: Ctx & { badges: SeededBadges }) {
	for (let i = 0; i < HISTORICAL_COUNT; i++) {
		const progression = faker.helpers.weightedArrayElement([
			{ value: DOUBLE_ELIMINATION, weight: 5 },
			{ value: ROUND_ROBIN_TO_SINGLE_ELIMINATION, weight: 3 },
			{ value: SINGLE_ELIMINATION, weight: 1 },
			{ value: DOUBLE_ELIMINATION_WITH_UNDERGROUND, weight: 1 },
		]);
		// recent ones ranked and within the front page's week-long results window
		const isRecent = i < 3;
		const startsAt = isRecent
			? sub(new Date(), { days: 1 + i, hours: 3 })
			: sub(new Date(), { months: 1 + (i % 8), days: (i * 7) % 28 });
		const badgeId = i % 3 === 0 ? badges.ids[i % badges.ids.length] : undefined;

		const tournament = await TournamentFactory.create({
			name: nameFor(10 + i),
			authorId: faker.helpers.arrayElement(users.showcaseIds),
			startTimes: [dateToDatabaseTimestamp(startsAt)],
			mapPickingStyle: isRecent ? "AUTO_SZ" : "AUTO_ALL",
			mapPoolMaps: isRecent ? undefined : tiebreakerMapPool(),
			bracketProgression: progression,
			teamsPerGroup: 4,
			isRanked: isRecent,
		});

		const teams = await registerTeams({
			tournamentId: tournament.id,
			rosters: rosters.take({ teamCount: 8, teamSize: 4 }),
			isCheckedIn: true,
			registeredAt: sub(startsAt, { days: 2 }),
			mapPool: () => counterpickMapPool(isRecent ? "AUTO_SZ" : "AUTO_ALL"),
		});

		const winnerTeamId = await playOut(tournament.id, progression);
		const winners = teams.find((team) => team.id === winnerTeamId);

		await TournamentFactory.finalize(tournament.id, {
			badgeReceivers:
				badgeId && winners
					? [
							{
								badgeId,
								tournamentTeamId: winners.id,
								userIds: winners.memberUserIds,
							},
						]
					: undefined,
		});
	}
}

async function seedTournamentExtras(tournamentId: number, users: SeededUsers) {
	for (const twitchAccount of ["sendou", "nzap_stream"]) {
		await TournamentStreamerFactory.create({ tournamentId, twitchAccount });
	}

	const lfgTeamIds: number[] = [];
	for (const [i, userId] of users.showcaseIds.slice(90, 96).entries()) {
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

/** Starts and plays every bracket of the progression; returns the winner's team id. */
async function playOut(tournamentId: number, progression: Progression) {
	const standingsBracketIdx = finalStandingsBracketIdx(progression);
	let winnerTeamId: number | undefined;

	for (let bracketIdx = 0; bracketIdx < progression.length; bracketIdx++) {
		await TournamentFactory.startBracket(tournamentId, { bracketIdx });

		while (true) {
			const played = await TournamentFactory.playMatches(tournamentId);
			if (played.length === 0) break;

			if (bracketIdx === standingsBracketIdx) {
				winnerTeamId = played[played.length - 1].winnerTeamId;
			}
		}
	}

	return winnerTeamId;
}

/** The bracket first place comes out of: the one sourcing the groups winners, or the first. */
function finalStandingsBracketIdx(progression: Progression) {
	const index = progression.findIndex((bracket) =>
		bracket.sources?.some((source) => source.placements.includes(1)),
	);

	return index === -1 ? 0 : index;
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

function nameFor(index: number) {
	const stem = TOURNAMENT_NAME_STEMS[index % TOURNAMENT_NAME_STEMS.length];

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

function daysAgo(days: number) {
	return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function hoursAgo(hours: number) {
	return new Date(Date.now() - hours * 60 * 60 * 1000);
}
