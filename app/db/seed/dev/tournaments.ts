import { addDays, addHours, addWeeks, sub, subWeeks } from "date-fns";
import type { TeamPickSettings, TournamentSettings } from "~/db/tables-json";
import * as Availability from "~/features/availability/core/Availability";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import { BANNED_MAPS } from "~/features/match-profile/banned-maps";
import * as TeamPick from "~/features/tournament/core/TeamPick";
import type { TournamentTierNumber } from "~/features/tournament/core/tiering";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import * as LeagueScheduling from "~/features/tournament-match/core/LeagueScheduling";
import { rankedModesShort } from "~/modules/in-game-lists/modes";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import {
	databaseTimestampToDate,
	dateToDatabaseTimestamp,
} from "~/utils/dates";
import { faker, unique } from "../core/faker";
import * as showcaseNames from "../core/showcaseNames";
import * as ImageFactory from "../factories/ImageFactory";
import * as SavedCalendarEventFactory from "../factories/SavedCalendarEventFactory";
import * as TournamentFactory from "../factories/TournamentFactory";
import * as TournamentLFGTeamFactory from "../factories/TournamentLFGTeamFactory";
import * as TournamentMatchScheduleFactory from "../factories/TournamentMatchScheduleFactory";
import * as TournamentStaffFactory from "../factories/TournamentStaffFactory";
import * as TournamentStreamerFactory from "../factories/TournamentStreamerFactory";
import * as TournamentTeamFactory from "../factories/TournamentTeamFactory";
import type { SeededBadges } from "./badges";
import type { SeededOrganization } from "./organizations";
import type { SeededTeams } from "./teams";
import type { SeededTrophies } from "./trophies";
import type { SeededUsers } from "./users";

const SZ_ONLY_TEAM_PICK: TeamPickSettings = {
	modes: [{ mode: "SZ", count: 6 }],
	pool: "SENDOUQ",
};
const RANKED_MODES_TEAM_PICK = TeamPick.defaultSettings([...rankedModesShort]);
/** Uneven counts from a custom pool: every SZ stage, half of the legal TC stages. */
const PADDLING_POOL_TEAM_PICK: TeamPickSettings = {
	modes: [
		{ mode: "SZ", count: 6 },
		{ mode: "TC", count: 3 },
	],
	pool: "CUSTOM",
};
const PADDLING_POOL_MAP_POOL = [
	...legalStages("SZ").map((stageId) => ({ mode: "SZ" as const, stageId })),
	...legalStages("TC")
		.slice(0, Math.ceil(legalStages("TC").length / 2))
		.map((stageId) => ({ mode: "TC" as const, stageId })),
];

/** Series the past tournaments are named off; the four in a state worth opening have series of their own. */
const TOURNAMENT_NAME_STEMS = [
	{ name: "PICNIC", avatarFileName: "picnic.png" },
	{ name: "The Depths", avatarFileName: "the-depths.png" },
	{ name: "Leagues Under The Ink", avatarFileName: "luti.png" },
];

/** The season in progress; the players' divisions come from the one before it. */
const LUTI_SEASON_IN_PROGRESS = 18;
/** Prod runs 13 divisions of 12–48 teams, the seed keeps three worth of every scheduling state. */
const LUTI_DIVISIONS = [
	{ name: "Division X", teamCount: 6, tier: 1 as TournamentTierNumber },
	{ name: "Division 1", teamCount: 12, tier: 3 as TournamentTierNumber },
	{ name: "Division 2", teamCount: 12, tier: 6 as TournamentTierNumber },
];
const LUTI_TEAMS_PER_GROUP = 6;
/** The round being played this week; the ones before it are done, the ones after not open. */
const LUTI_CURRENT_ROUND = 3;
const LUTI_BEST_OF = 9;
const LUTI_MODE_CYCLE: ModeShort[] = ["SZ", "TC", "RM", "CB"];
const LUTI_MIN_MEMBERS = 4;
const LUTI_MAX_MEMBERS = 8;

const HISTORICAL_COUNT = 5;
/** Showcase users seeded into every played tournament, so their results paginate. */
const CORE_PLAYER_COUNT = 8;
/** Share of teams registering as one of the site's teams, the rest being pickups. */
const REGISTERED_TEAM_SHARE = 0.4;
/** Solo players looking for a team in a tournament whose registration has closed. */
const SUB_COUNT = 7;

/** One team's registration: the site team it registers as, when it is one of them. */
type Roster = {
	teamId: number | null;
	name: string;
	memberUserIds: number[];
};

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
	regOpen: {
		id: number;
		name: string;
		startsAt: number;
		/** The roster the admin registered on. */
		memberUserIds: number[];
	};
	/** Teams N-ZAP played on in the tournaments that were played to the end. */
	nzapTeamIds: number[];
	/** The league in progress, with the pieces other seeds hang their data on. */
	luti: {
		id: number;
		name: string;
		/** N-ZAP's set of the current round, the one with the other team's candidates on the board. */
		nzapMatchId: number;
		nzapOpponentTeamName: string;
		nzapTeammateIds: number[];
		/** Members streaming a set that is live right now. */
		streamerUserIds: number[];
	};
};

export async function seedTournaments({
	users,
	organizations,
	badges,
	teams,
	trophies,
}: {
	users: SeededUsers;
	organizations: SeededOrganization[];
	badges: SeededBadges;
	teams: SeededTeams;
	trophies: SeededTrophies;
}): Promise<SeededTournaments> {
	const rosters = rosterBuilder(users, teams);
	// editions of a series share one logo image, an image row not being allowed the url of another
	const seriesLogoImgIds = new Map<string, number>();

	const inTheZone = await seedInTheZone({
		users,
		organizations,
		rosters,
		teams,
		trophies,
	});
	await seedPaddlingPool({ users, organizations, rosters });
	await seedLowInk({ users, organizations, rosters });
	await seedSwimOrSink({ users, organizations, rosters });
	const luti = await seedLuti({
		users,
		organizations,
		rosters,
		seriesLogoImgIds,
	});

	const nzapTeamIds = await seedHistoricalTournaments({
		users,
		organizations,
		badges,
		rosters,
		trophies,
		seriesLogoImgIds,
	});

	return { regOpen: inTheZone, nzapTeamIds, luti };
}

type Ctx = {
	users: SeededUsers;
	organizations: SeededOrganization[];
	rosters: ReturnType<typeof rosterBuilder>;
};

/**
 * #1 double elim, TO maps — reg open, a couple of days out: registered teams (some short of a full roster)
 * and LFG teams. The admin's Alliance Rogue roster mixes every availability state the panel can show.
 */
async function seedInTheZone({
	users,
	organizations,
	rosters,
	teams,
	trophies,
}: Ctx & { teams: SeededTeams; trophies: SeededTrophies }) {
	const name = nameFor("In The Zone");
	const startsAt = dateToDatabaseTimestamp(daysFromNow(2));

	const tournament = await TournamentFactory.create({
		name,
		authorId: users.adminId,
		organizationId: organizations[0]?.id,
		avatarFileName: "in-the-zone.png",
		startTimes: [startsAt],
		mapPickingStyle: "TO",
		mapPoolMaps: toSetMapPool(),
		bracketProgression: DOUBLE_ELIMINATION,
		enableSubs: true,
		trophyId: trophies.ids[0],
	});

	// in roster order: admin and multiRange fully available, weekend free from an hour in, unavailable
	// submitted an empty week, the captain (N-ZAP) reports nothing
	const [, multiRangeId, , unavailableId, weekendId] =
		teams.allianceRogue.playerUserIds;
	const allianceRogueRoster: Roster = {
		teamId: teams.allianceRogueId,
		name: teams.squads.find((squad) => squad.teamId === teams.allianceRogueId)!
			.name,
		memberUserIds: [
			users.adminId,
			multiRangeId,
			weekendId,
			unavailableId,
			users.nzapId,
		],
	};

	const teamRosters = rosters.take({
		teamCount: 10,
		teamSize: 4,
		preset: [allianceRogueRoster],
	});

	for (const [i, roster] of teamRosters.entries()) {
		await TournamentTeamFactory.create({
			tournamentId: tournament.id,
			team: fakeTeamProfile(roster),
			// not every registered roster is full while reg is still open
			memberUserIds:
				i % 3 === 2 ? roster.memberUserIds.slice(0, 3) : roster.memberUserIds,
			hasAvatar: roster.teamId === null && i % 4 === 0,
		});
	}

	await seedTournamentExtras(tournament.id, users);

	return {
		id: tournament.id,
		name,
		startsAt,
		memberUserIds: teamRosters[0].memberUserIds,
	};
}

/** #2 double elim + underground, team picked SZ ×6 + TC ×3 from a custom pool, ranked — started, nothing reported. N-ZAP is seeded past the byes so he has a match going. */
async function seedPaddlingPool({ users, rosters }: Ctx) {
	const tournament = await TournamentFactory.create({
		name: nameFor("Paddling Pool"),
		authorId: users.adminId,
		avatarFileName: "paddling-pool.png",
		startTimes: [dateToDatabaseTimestamp(hoursAgo(1))],
		mapPickingStyle: "AUTO",
		teamPick: PADDLING_POOL_TEAM_PICK,
		mapPoolMaps: PADDLING_POOL_MAP_POOL,
		bracketProgression: DOUBLE_ELIMINATION_WITH_UNDERGROUND,
		isRanked: true,
	});

	const teamRosters = rosters.take({
		teamCount: 12,
		teamSize: 4,
		pinned: [{ teamIdx: 4, userId: users.nzapId }],
	});

	await registerTeams({
		tournamentId: tournament.id,
		rosters: teamRosters,
		isCheckedIn: true,
		mapPool: () =>
			counterpickMapPool(PADDLING_POOL_TEAM_PICK, PADDLING_POOL_MAP_POOL),
	});

	await TournamentFactory.startBracket(tournament.id);
	await seedSubs(tournament.id, users);
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

	const teamRosters = rosters.take({
		teamCount: 8,
		teamSize: 4,
		pinned: [{ teamIdx: 0, userId: users.nzapId }],
	});

	await registerTeams({
		tournamentId: tournament.id,
		rosters: teamRosters,
		isCheckedIn: true,
	});

	await TournamentFactory.playOut(tournament.id, 0);
}

/** #4 round robin → SE, TO maps — everybody checked in, not started. N-ZAP isn't registered, so it is his saved one. */
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

	await registerTeams({
		tournamentId: tournament.id,
		rosters: teamRosters,
		isCheckedIn: true,
	});

	await SavedCalendarEventFactory.create({
		userId: users.nzapId,
		tournamentId: tournament.id,
	});
}

/**
 * #5 LUTI in progress, mirroring prod: an org's league of three divisions, each a round robin feeding
 * playoffs, five weekly rounds on Bo9 TO map lists. Rounds 1–2 are played, round 3 is this week's with
 * every scheduling state on show (N-ZAP has the other team's candidates waiting, the admin organizes
 * and plays a set scheduled for tomorrow), rounds 4–5 are not open yet.
 */
async function seedLuti({
	users,
	organizations,
	rosters,
	seriesLogoImgIds,
}: Ctx & { seriesLogoImgIds: Map<string, number> }) {
	const now = new Date();
	const thisMonday = databaseTimestampToDate(
		Availability.weekStartsAt(now, "UTC"),
	);
	const roundMonday = (roundNumber: number) =>
		addWeeks(thisMonday, roundNumber - LUTI_CURRENT_ROUND);
	const startsAt = addHours(roundMonday(1), 8);
	const name = `LUTI: Season ${LUTI_SEASON_IN_PROGRESS}`;

	const tournament = await TournamentFactory.create(
		{
			name,
			authorId: users.adminId,
			organizationId: organizations.find(
				(organization) => organization.name === "Leagues Under The Ink",
			)?.id,
			avatarImgId: await seriesLogoImgId(
				seriesLogoImgIds,
				TOURNAMENT_NAME_STEMS[2],
				users.adminId,
			),
			startTimes: [dateToDatabaseTimestamp(startsAt)],
			regClosesAt: dateToDatabaseTimestamp(subWeeks(startsAt, 1)),
			mapPickingStyle: "TO",
			mapPoolMaps: toSetMapPool(),
			bracketProgression: lutiProgression(),
			minMembersPerTeam: LUTI_MIN_MEMBERS,
			maxMembersPerTeam: LUTI_MAX_MEMBERS,
			isRanked: false,
		},
		{
			isLeague: true,
			tiers: Object.fromEntries(
				LUTI_DIVISIONS.map((division, index) => [index * 2, division.tier]),
			),
		},
	);

	const teamCount = LUTI_DIVISIONS.reduce(
		(sum, division) => sum + division.teamCount,
		0,
	);
	const nzapTeamIdx = LUTI_DIVISIONS[0].teamCount;
	const teamRosters = rosters.take({
		teamCount,
		teamSize: LUTI_MAX_MEMBERS,
		// the admin's team plays Division X, N-ZAP's opens Division 1
		pinned: [
			{ teamIdx: 0, userId: users.adminId },
			{ teamIdx: nzapTeamIdx, userId: users.nzapId },
		],
	});

	const divisionOfTeamIdx = (teamIdx: number) => {
		let firstIdxOfDivision = 0;
		for (const [index, division] of LUTI_DIVISIONS.entries()) {
			if (teamIdx < firstIdxOfDivision + division.teamCount) return index;
			firstIdxOfDivision += division.teamCount;
		}
		throw new Error(`No division for team ${teamIdx}`);
	};

	const teams: Awaited<ReturnType<typeof TournamentTeamFactory.create>>[] = [];
	for (const [i, roster] of teamRosters.entries()) {
		const memberUserIds = roster.memberUserIds.slice(
			0,
			LUTI_MIN_MEMBERS + (i % (LUTI_MAX_MEMBERS - LUTI_MIN_MEMBERS + 1)),
		);
		teams.push(
			await TournamentTeamFactory.create(
				{
					tournamentId: tournament.id,
					team: fakeTeamProfile(roster),
					memberUserIds,
					registeredAt: sub(startsAt, { days: 10 + (i % 5) }),
					hasAvatar: roster.teamId === null && i % 4 === 0,
				},
				{ isCheckedIn: true, startingBracketIdx: divisionOfTeamIdx(i) * 2 },
			),
		);
	}

	await TournamentStaffFactory.create({
		tournamentId: tournament.id,
		userId: users.showcaseIds[96],
		role: "STREAMER",
	});
	await TournamentStreamerFactory.create({
		tournamentId: tournament.id,
		twitchAccount: "luti_cast",
	});

	for (const [index] of LUTI_DIVISIONS.entries()) {
		await TournamentFactory.startBracket(tournament.id, {
			bracketIdx: index * 2,
			maps: lutiRoundMaps,
			isPlayableAt: (roundNumber) =>
				LeagueScheduling.playableAtFromDate(roundMonday(roundNumber)),
		});
	}

	const started = await tournamentFromDB(tournament.id);
	const setsOf = (divisionIndex: number, roundNumber: number) => {
		const bracket = started.bracketByIdx(divisionIndex * 2);
		if (!bracket) throw new Error(`Division ${divisionIndex} not started`);
		const roundIds = bracket.data.round
			.filter((round) => round.number === roundNumber)
			.map((round) => round.id);

		return bracket.data.match.filter((match) =>
			roundIds.includes(match.roundId),
		);
	};
	const teamIdsOf = (match: {
		opponent1: { id: number | null } | null;
		opponent2: { id: number | null } | null;
	}) =>
		[match.opponent1?.id, match.opponent2?.id].filter(
			(id): id is number => typeof id === "number",
		);
	const memberIdsOf = (teamId: number) =>
		teams.find((team) => team.id === teamId)?.memberUserIds ?? [];
	const nameOf = (teamId: number) => started.teamById(teamId)?.name ?? "";

	// Division 2 has two round 2 stragglers, the rest of rounds 1–2 got played on their week
	const stragglerIds = setsOf(2, 2)
		.slice(0, 2)
		.map((match) => match.id);
	for (const roundNumber of [1, 2]) {
		const played = await TournamentFactory.playMatches(tournament.id, {
			roundNumbers: [roundNumber],
			matchIds: LUTI_DIVISIONS.flatMap((_, divisionIndex) =>
				setsOf(divisionIndex, roundNumber)
					.map((match) => match.id)
					.filter((id) => !stragglerIds.includes(id)),
			),
		});
		for (const [i, match] of played.entries()) {
			await TournamentFactory.backdateMatch({
				matchId: match.id,
				playedAt: addHours(
					addDays(roundMonday(roundNumber), 1 + (i % 5)),
					17 + (i % 4),
				),
			});
		}
	}

	const at = (daysFromMonday: number, hour: number) =>
		dateToDatabaseTimestamp(
			addHours(addDays(thisMonday, daysFromMonday), hour),
		);
	const nowAt = dateToDatabaseTimestamp(now);
	const streamerUserIds: number[] = [];

	// Division X: every set scheduled, one of them live right now
	const [xLive, xAdmin, xLater] = setsOf(0, LUTI_CURRENT_ROUND).toSorted(
		(a, b) =>
			Number(teamIdsOf(a).includes(teams[0].id)) -
			Number(teamIdsOf(b).includes(teams[0].id)),
	);
	await TournamentMatchScheduleFactory.schedule({
		matchId: xLive.id,
		scheduledAt: nowAt - 10 * 60,
	});
	streamerUserIds.push(memberIdsOf(teamIdsOf(xLive)[0])[1]);
	await TournamentMatchScheduleFactory.schedule({
		matchId: xAdmin.id,
		scheduledAt: dateToDatabaseTimestamp(
			new Date(
				Date.UTC(
					now.getUTCFullYear(),
					now.getUTCMonth(),
					now.getUTCDate() + 1,
					19,
				),
			),
		),
	});
	await TournamentMatchScheduleFactory.schedule({
		matchId: xLater.id,
		scheduledAt: at(5, 20),
	});

	// Division 1: N-ZAP's set has the other team's candidates waiting, the rest spread over every state
	const nzapTeamId = teams[nzapTeamIdx].id;
	const [nzapSet, ...otherSets] = setsOf(1, LUTI_CURRENT_ROUND).toSorted(
		(a, b) =>
			Number(teamIdsOf(b).includes(nzapTeamId)) -
			Number(teamIdsOf(a).includes(nzapTeamId)),
	);
	const nzapOpponentId = teamIdsOf(nzapSet).find((id) => id !== nzapTeamId)!;
	await TournamentMatchScheduleFactory.propose({
		matchId: nzapSet.id,
		tournamentTeamId: nzapOpponentId,
		authorId: memberIdsOf(nzapOpponentId)[0],
		proposedAts: [at(1, 20), at(3, 19)],
		createdAt: sub(now, { days: 1 }),
	});
	const [playedSet, scheduledSet, organizerSet, liveSet, castSet] = otherSets;
	if (playedSet) {
		await TournamentFactory.playMatches(tournament.id, {
			matchIds: [playedSet.id],
		});
		await TournamentFactory.backdateMatch({
			matchId: playedSet.id,
			playedAt: sub(now, { days: 1, hours: 2 }),
		});
	}
	if (scheduledSet) {
		await TournamentMatchScheduleFactory.schedule({
			matchId: scheduledSet.id,
			scheduledAt: at(4, 19),
		});
	}
	if (organizerSet) {
		await TournamentMatchScheduleFactory.schedule({
			matchId: organizerSet.id,
			scheduledAt: at(5, 18),
			byOrganizer: true,
		});
	}
	if (liveSet) {
		await TournamentMatchScheduleFactory.schedule({
			matchId: liveSet.id,
			scheduledAt: nowAt - 5 * 60,
		});
		streamerUserIds.push(memberIdsOf(teamIdsOf(liveSet)[1])[0]);
	}
	if (castSet) {
		await TournamentMatchScheduleFactory.schedule({
			matchId: castSet.id,
			scheduledAt: nowAt + 26 * 60 * 60,
		});
		await TournamentFactory.castMatch({
			tournamentId: tournament.id,
			matchId: castSet.id,
			twitchAccount: "luti_cast",
		});
	}

	// Division 2: half unscheduled and quiet, one board with both teams' candidates, the rest scheduled
	const [bothProposed, scheduledA, scheduledB] = setsOf(2, LUTI_CURRENT_ROUND);
	for (const [index, teamId] of teamIdsOf(bothProposed).entries()) {
		await TournamentMatchScheduleFactory.propose({
			matchId: bothProposed.id,
			tournamentTeamId: teamId,
			authorId: memberIdsOf(teamId)[0],
			proposedAts: [at(2 + index, 20), at(4 + index, 19)],
			createdAt: sub(now, { hours: 20 - index * 6 }),
		});
	}
	await TournamentMatchScheduleFactory.schedule({
		matchId: scheduledA.id,
		scheduledAt: at(3, 20),
	});
	await TournamentMatchScheduleFactory.schedule({
		matchId: scheduledB.id,
		scheduledAt: at(6, 17),
	});

	return {
		id: tournament.id,
		name,
		nzapMatchId: nzapSet.id,
		nzapOpponentTeamName: nameOf(nzapOpponentId),
		nzapTeammateIds: teams[nzapTeamIdx].memberUserIds.filter(
			(userId) => userId !== users.nzapId,
		),
		streamerUserIds,
	};
}

/** Every division is a round robin whose top two go on to its playoffs. */
function lutiProgression(): Progression {
	return LUTI_DIVISIONS.flatMap((division, index) => [
		{
			type: "round_robin" as const,
			name: division.name,
			requiresCheckIn: false,
			settings: { teamsPerGroup: LUTI_TEAMS_PER_GROUP },
		},
		{
			type: "single_elimination" as const,
			name: `${division.name} Playoffs`,
			requiresCheckIn: false,
			settings: {},
			sources: [{ bracketIdx: index * 2, placements: [1, 2] }],
		},
	]);
}

/** Bo9 TO map lists cycling the modes, a different list per round. */
function lutiRoundMaps(round: { number: number }): TournamentFactory.RoundMaps {
	return {
		count: LUTI_BEST_OF,
		type: "BEST_OF",
		list: Array.from({ length: LUTI_BEST_OF }, (_, i) => {
			const mode =
				LUTI_MODE_CYCLE[(round.number - 1 + i) % LUTI_MODE_CYCLE.length];
			const stages = legalStages(mode);

			return { mode, stageId: stages[(round.number * 3 + i) % stages.length] };
		}),
	};
}

async function seedHistoricalTournaments({
	users,
	badges,
	rosters,
	trophies,
	seriesLogoImgIds,
}: Ctx & {
	badges: SeededBadges;
	trophies: SeededTrophies;
	seriesLogoImgIds: Map<string, number>;
}) {
	const nzapTeamIds: number[] = [];

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
		const stem = TOURNAMENT_NAME_STEMS[i % TOURNAMENT_NAME_STEMS.length];
		const authorId = faker.helpers.arrayElement(users.showcaseIds);
		const teamPick = isRecent ? SZ_ONLY_TEAM_PICK : RANKED_MODES_TEAM_PICK;

		const tournament = await TournamentFactory.create(
			{
				name: nameFor(stem.name),
				avatarImgId: await seriesLogoImgId(seriesLogoImgIds, stem, authorId),
				authorId,
				startTimes: [dateToDatabaseTimestamp(startsAt)],
				mapPickingStyle: "AUTO",
				teamPick,
				bracketProgression: progression,
				teamsPerGroup: 4,
				isRanked: isRecent,
				badges: badgeId ? [badgeId] : [],
				trophyId: trophies.ids[i % trophies.ids.length],
			},
			{ tier: ((i % 3) + 1) as TournamentTierNumber },
		);

		// top seed of the first (a finalized win), further down in another so his results aren't all firsts
		const nzapRosterIdx = i === 0 ? 0 : i === 2 ? 5 : null;

		const teamRosters = rosters.take({
			teamCount: 8,
			teamSize: 4,
			pinned:
				nzapRosterIdx !== null
					? [{ teamIdx: nzapRosterIdx, userId: users.nzapId }]
					: [],
		});

		const teams = await registerTeams({
			tournamentId: tournament.id,
			rosters: teamRosters,
			isCheckedIn: true,
			registeredAt: sub(startsAt, { days: 2 }),
			mapPool: () => counterpickMapPool(teamPick),
		});

		if (nzapRosterIdx !== null) {
			nzapTeamIds.push(teams[nzapRosterIdx].id);
		}

		await TournamentFactory.playOut(tournament.id, "all");
	}

	return nzapTeamIds;
}

/** Editions of a series share one logo image, an image row not being allowed the url of another. */
async function seriesLogoImgId(
	imgIds: Map<string, number>,
	stem: (typeof TOURNAMENT_NAME_STEMS)[number],
	authorId: number,
) {
	const existing = imgIds.get(stem.name);
	if (existing) return existing;

	const image = await ImageFactory.create(
		{ submitterUserId: authorId, url: stem.avatarFileName },
		{ isValidated: true },
	);
	imgIds.set(stem.name, image.id);

	return image.id;
}

/** Subs for a closed-registration tournament, the admin among them. Drawn from the tail of the crowd no roster reaches. */
async function seedSubs(tournamentId: number, users: SeededUsers) {
	const userIds = [
		users.adminId,
		...users.crowdIds.slice(300, 300 + SUB_COUNT - 1),
	];

	for (const [i, userId] of userIds.entries()) {
		await TournamentLFGTeamFactory.create({
			tournamentId,
			userId,
			isStayAsSub: true,
			lfgNote: i % 3 === 0 ? undefined : showcaseNames.postText(),
		});
	}
}

async function seedTournamentExtras(tournamentId: number, users: SeededUsers) {
	for (const twitchAccount of ["sendou", "nzap_stream"]) {
		await TournamentStreamerFactory.create({ tournamentId, twitchAccount });
	}

	// not N-ZAP: he registers with Alliance Rogue and a player can't both be on a team and look for one
	const lfgUserIds = users.showcaseIds.slice(90, 96);

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
	rosters: Roster[];
	isCheckedIn?: boolean;
	registeredAt?: Date;
	mapPool?: () => MapPool;
}) {
	const teams: Awaited<ReturnType<typeof TournamentTeamFactory.create>>[] = [];
	for (const [i, roster] of rosters.entries()) {
		teams.push(
			await TournamentTeamFactory.create(
				{
					tournamentId,
					team: fakeTeamProfile(roster),
					memberUserIds: roster.memberUserIds,
					mapPool: mapPool?.(),
					registeredAt,
					// a team of the site shows its own logo when the registration has none
					hasAvatar: roster.teamId === null && i % 5 === 0,
				},
				{ isCheckedIn },
			),
		);
	}

	return teams;
}

function rosterBuilder(users: SeededUsers, teams: SeededTeams) {
	const corePlayers = users.showcaseIds.slice(0, CORE_PLAYER_COUNT);
	const pool = [
		...users.showcaseIds.slice(CORE_PLAYER_COUNT),
		...users.crowdIds.slice(0, 300),
	];

	return {
		/**
		 * Some site teams register as themselves, core players spread over the rest, remaining seats drawn without
		 * replacement. A `pinned` user owns a roster of their own; a `preset` roster takes the first slots as given.
		 */
		take({
			teamCount,
			teamSize,
			pinned = [],
			preset = [],
		}: {
			teamCount: number;
			teamSize: number;
			pinned?: Array<{ teamIdx: number; userId: number }>;
			preset?: Roster[];
		}): Roster[] {
			const pinnedUserIds = new Set([
				...pinned.map((pin) => pin.userId),
				...preset.flatMap((roster) => roster.memberUserIds),
			]);
			const registering = faker.helpers
				.shuffle(
					teams.squads.filter((squad) =>
						squad.memberUserIds.every((id) => !pinnedUserIds.has(id)),
					),
				)
				.slice(0, Math.round(teamCount * REGISTERED_TEAM_SHARE));

			// a tournament can not have two teams of the same name
			const takenNames = new Set([
				...registering.map((squad) => squad.name),
				...preset.map((roster) => roster.name),
			]);

			const takenUserIds = new Set([
				...pinnedUserIds,
				...registering.flatMap((squad) => squad.memberUserIds),
			]);
			const isFree = (userId: number) => !takenUserIds.has(userId);

			const shuffled = faker.helpers.shuffle(pool.filter(isFree));
			const freeCorePlayers = corePlayers.filter(isFree);

			// site teams take the first slots a preset or a pin does not want
			const pinnedIdxs = new Set(pinned.map((pin) => pin.teamIdx));
			const registeringIdxs = Array.from({ length: teamCount }, (_, i) => i)
				.filter((i) => !pinnedIdxs.has(i) && i >= preset.length)
				.slice(0, registering.length);

			return Array.from({ length: teamCount }, (_, i) => {
				if (i < preset.length) return preset[i];

				const registeringIdx = registeringIdxs.indexOf(i);
				if (registeringIdx !== -1) {
					const squad = registering[registeringIdx];

					return {
						teamId: squad.teamId,
						name: squad.name,
						memberUserIds: squad.memberUserIds.slice(0, teamSize),
					};
				}

				const memberUserIds: number[] = [];
				if (teamSize >= 2 && freeCorePlayers.length > 0) {
					memberUserIds.push(freeCorePlayers.shift()!);
				}

				while (memberUserIds.length < teamSize) {
					memberUserIds.push(shuffled.pop()!);
				}

				const pin = pinned.find((candidate) => candidate.teamIdx === i);
				if (pin) {
					memberUserIds.unshift(pin.userId);
				}

				return {
					teamId: null,
					name: pickupTeamName(takenNames),
					memberUserIds,
				};
			});
		},
	};
}

/** A name for a team put together for one tournament, taken by no other team of it. */
function pickupTeamName(takenNames: Set<string>) {
	let name = unique(() => showcaseNames.teamName());
	while (takenNames.has(name)) {
		name = unique(() => showcaseNames.teamName());
	}
	takenNames.add(name);

	return name;
}

function fakeTeamProfile(roster: Roster) {
	return {
		name: roster.name,
		prefersNotToHost: faker.number.float(1) < 0.2 ? (1 as const) : (0 as const),
		teamId: roster.teamId,
	};
}

/** Series name and the edition of it this tournament is, as they are named. */
function nameFor(stem: string) {
	return `${stem} ${faker.number.int({ min: 2, max: 120 })}`;
}

function toSetMapPool() {
	return mapsPerMode(7);
}

function mapsPerMode(count: number) {
	return rankedModesShort.flatMap((mode) =>
		legalStages(mode)
			.slice(0, count)
			.map((stageId) => ({ mode, stageId })),
	);
}

/** A team's picks: the configured amount of random stages per mode from the tournament's pool. */
function counterpickMapPool(
	teamPick: TeamPickSettings,
	customPool: Array<{ mode: ModeShort; stageId: StageId }> = [],
) {
	const pool = TeamPick.effectivePool(teamPick, customPool);

	return new MapPool(
		teamPick.modes.flatMap(({ mode, count }) =>
			faker.helpers
				.arrayElements(pool.parsed[mode], count)
				.map((stageId) => ({ mode, stageId })),
		),
	);
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
