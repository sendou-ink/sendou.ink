import { faker } from "@faker-js/faker";
import { add, sub } from "date-fns";
import { sql } from "kysely";
import { nanoid } from "nanoid";
import * as R from "remeda";
import { Config } from "~/config";
import { db } from "~/db/sql";
import type { DBBoolean } from "~/db/tables";
import { ADMIN_DISCORD_ID, ADMIN_ID } from "~/features/admin/admin-constants";
import type { SeedVariation } from "~/features/api-private/routes/seed";
import * as AssociationRepository from "~/features/associations/AssociationRepository.server";
import * as BuildRepository from "~/features/builds/BuildRepository.server";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import { tags } from "~/features/calendar/calendar-constants";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import * as LFGRepository from "~/features/lfg/LFGRepository.server";
import { TIMEZONES } from "~/features/lfg/lfg-constants";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import { BANNED_MAPS } from "~/features/match-profile/banned-maps";
import * as MatchProfileRepository from "~/features/match-profile/MatchProfileRepository.server";
import { AMOUNT_OF_MAPS_IN_POOL_PER_MODE } from "~/features/match-profile/match-profile-constants";
import * as NotificationRepository from "~/features/notifications/NotificationRepository.server";
import type { Notification } from "~/features/notifications/notifications-types";
import * as PlusSuggestionRepository from "~/features/plus-suggestions/PlusSuggestionRepository.server";
import {
	lastCompletedVoting,
	nextNonCompletedVoting,
	rangeToMonthYear,
} from "~/features/plus-voting/core";
import * as PlusVotingRepository from "~/features/plus-voting/PlusVotingRepository.server";
import * as ScrimPostRepository from "~/features/scrims/ScrimPostRepository.server";
import { LUTI_DIVS } from "~/features/scrims/scrims-constants";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import * as ReportedWeaponRepository from "~/features/sendouq-match/ReportedWeaponRepository.server";
import * as SQMatchRepository from "~/features/sendouq-match/SQMatchRepository.server";
import { PRESET_COLORS } from "~/features/tier-list-maker/tier-list-maker-constants";
import type { TournamentMapPickingStyle } from "~/features/tournament/tournament-constants";
import { clearAllTournamentDataCache } from "~/features/tournament-bracket/core/Tournament.server";
import * as TournamentLFGRepository from "~/features/tournament-lfg/TournamentLFGRepository.server";
import * as TournamentOrganizationRepository from "~/features/tournament-organization/TournamentOrganizationRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { USER_REPORT_CATEGORIES } from "~/features/user-report/user-report-constants";
import * as VodRepository from "~/features/vods/VodRepository.server";
import {
	secondsToHoursMinutesSecondString,
	youtubeIdToYoutubeUrl,
} from "~/features/vods/vods-utils";
import type { UnifiedLanguageCode } from "~/modules/i18n/config";
import { abilities } from "~/modules/in-game-lists/abilities";
import {
	clothesGearIds,
	headGearIds,
	shoesGearIds,
} from "~/modules/in-game-lists/gear-ids";
import { modesShort, rankedModesShort } from "~/modules/in-game-lists/modes";
import { stagesObj as s, stageIds } from "~/modules/in-game-lists/stage-ids";
import type {
	AbilityType,
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import {
	canonicalWeaponSplId,
	mainWeaponIds,
} from "~/modules/in-game-lists/weapon-ids";
import type { TournamentMapListMap } from "~/modules/tournament-map-list-generator/types";
import { nullFilledArray } from "~/utils/arrays";
import {
	databaseTimestampNow,
	databaseTimestampToDate,
	dateToDatabaseTimestamp,
} from "~/utils/dates";
import { shortNanoid } from "~/utils/id";
import invariant from "~/utils/invariant";
import { toDBBoolean } from "~/utils/sql";
import { randomTeamName } from "~/utils/team-name";
import { mySlugify, navIconUrl, sendouQMatchPage } from "~/utils/urls";
import {
	getArtFilename,
	SEED_ART_URLS,
	SEED_TEAM_IMAGES,
	SEED_TOURNAMENT_IMAGES,
} from "../../../scripts/seed-art-urls";
import type { Tables } from "../tables";
import type { ParsedMemento, UserMapModePreferences } from "../tables-json";
import {
	ADMIN_TEST_AVATAR,
	AMOUNT_OF_CALENDAR_EVENTS,
	NZAP_TEST_AVATAR,
	NZAP_TEST_DISCORD_ID,
	NZAP_TEST_ID,
	ORG_ADMIN_TEST_ID,
	STAFF_TEST_DISCORD_ID,
	STAFF_TEST_ID,
} from "./constants";
import placements from "./placements.json";

const SENDOUQ_DEFAULT_MAPS: Record<
	ModeShort,
	[StageId, StageId, StageId, StageId, StageId, StageId, StageId]
> = {
	TW: [
		s.EELTAIL_ALLEY,
		s.HAGGLEFISH_MARKET,
		s.UNDERTOW_SPILLWAY,
		s.WAHOO_WORLD,
		s.UM_AMI_RUINS,
		s.HUMPBACK_PUMP_TRACK,
		s.ROBO_ROM_EN,
	],
	SZ: [
		s.HAGGLEFISH_MARKET,
		s.MAHI_MAHI_RESORT,
		s.INKBLOT_ART_ACADEMY,
		s.MAKOMART,
		s.HUMPBACK_PUMP_TRACK,
		s.CRABLEG_CAPITAL,
		s.ROBO_ROM_EN,
	],
	TC: [
		s.ROBO_ROM_EN,
		s.EELTAIL_ALLEY,
		s.UNDERTOW_SPILLWAY,
		s.MUSEUM_D_ALFONSINO,
		s.MAKOMART,
		s.MANTA_MARIA,
		s.SHIPSHAPE_CARGO_CO,
	],
	RM: [
		s.SCORCH_GORGE,
		s.HAGGLEFISH_MARKET,
		s.UNDERTOW_SPILLWAY,
		s.MUSEUM_D_ALFONSINO,
		s.FLOUNDER_HEIGHTS,
		s.CRABLEG_CAPITAL,
		s.MINCEMEAT_METALWORKS,
	],
	CB: [
		s.SCORCH_GORGE,
		s.INKBLOT_ART_ACADEMY,
		s.BRINEWATER_SPRINGS,
		s.MANTA_MARIA,
		s.HUMPBACK_PUMP_TRACK,
		s.UM_AMI_RUINS,
		s.ROBO_ROM_EN,
	],
};

const calendarEventWithToToolsRegOpen = () =>
	calendarEventWithToTools("PICNIC", true);

const calendarEventWithToToolsSz = () => calendarEventWithToTools("ITZ");
const calendarEventWithToToolsTeamsSz = () =>
	calendarEventWithToToolsTeams("ITZ");

const calendarEventWithToToolsPP = () => calendarEventWithToTools("PP");
const calendarEventWithToToolsPPRegOpen = () =>
	calendarEventWithToTools("PP", true);
const calendarEventWithToToolsTeamsPP = () =>
	calendarEventWithToToolsTeams("PP");

const calendarEventWithToToolsSOS = () => calendarEventWithToTools("SOS");
const calendarEventWithToToolsTeamsSOS = () =>
	calendarEventWithToToolsTeams("SOS");
const calendarEventWithToToolsTeamsSOSSmall = () =>
	calendarEventWithToToolsTeams("SOS", true);

const calendarEventWithToToolsDepths = () => calendarEventWithToTools("DEPTHS");
const calendarEventWithToToolsTeamsDepths = () =>
	calendarEventWithToToolsTeams("DEPTHS");

const calendarEventWithToToolsLUTI = () => calendarEventWithToTools("LUTI");
const calendarEventWithToToolsTeamsLUTI = () =>
	calendarEventWithToToolsTeams("LUTI");

const basicSeeds = (variation?: SeedVariation | null) => [
	adminUser,
	makeAdminPatron,
	makeAdminVideoAdder,
	makeAdminTournamentOrganizer,
	nzapUser,
	users,
	staffUser,
	fixAdminId,
	fixStaffUserId,
	makeArtists,
	adminUserWeaponPool,
	adminUserWidgets,
	userProfiles,
	userCardData,
	variation === "TEAM_MAP_PREFS" ? undefined : userMapModePreferences,
	userMatchProfileWeaponPool,
	seedingSkills,
	lastMonthsVoting,
	syncPlusTiers,
	lastMonthSuggestions,
	thisMonthsSuggestions,
	badgesToUsers,
	badgeManagers,
	patrons,
	insertTeamAndTournamentImages,
	organization,
	calendarEvents,
	calendarEventBadges,
	calendarEventResults,
	variation === "REG_OPEN"
		? calendarEventWithToToolsRegOpen
		: calendarEventWithToTools,
	calendarEventWithToToolsTieBreakerMapPool,
	variation === "NO_TOURNAMENT_TEAMS" || variation === "REG_OPEN"
		? undefined
		: calendarEventWithToToolsTeams,
	calendarEventWithToToolsSz,
	variation === "NO_TOURNAMENT_TEAMS"
		? undefined
		: calendarEventWithToToolsTeamsSz,
	variation === "REG_OPEN"
		? calendarEventWithToToolsPPRegOpen
		: calendarEventWithToToolsPP,
	variation === "NO_TOURNAMENT_TEAMS"
		? undefined
		: calendarEventWithToToolsTeamsPP,
	calendarEventWithToToolsSOS,
	variation === "SMALL_SOS"
		? calendarEventWithToToolsTeamsSOSSmall
		: calendarEventWithToToolsTeamsSOS,
	calendarEventWithToToolsToSetMapPool,
	calendarEventWithToToolsDepths,
	calendarEventWithToToolsTeamsDepths,
	calendarEventWithToToolsLUTI,
	calendarEventWithToToolsTeamsLUTI,
	variation === "NO_TOURNAMENT_TEAMS" ? undefined : tournamentLfgGroups,
	adminBuilds,
	manySplattershotBuilds,
	detailedTeam(variation),
	otherTeams,
	realVideo,
	realVideoCast,
	xRankPlacements,
	arts,
	commissionsOpen,
	playedMatches,
	variation === "NO_SQ_GROUPS" ? undefined : () => groups(variation),
	friendCodes,
	userReports,
	lfgPosts,
	variation === "NO_SCRIMS" ? undefined : scrimPosts,
	variation === "NO_SCRIMS" ? undefined : scrimPostRequests,
	associations,
	notifications,
	() => friendships(variation),
	liveStreams,
	splatoonRotations,
	variation === "FINALIZED_BRACKET" ? finalizedBracket : undefined,
	variation === "AB_RR" ? abDivisionsTournament : undefined,
];

export async function seed(variation?: SeedVariation | null) {
	await wipeDB();

	for (const seedFunc of basicSeeds(variation)) {
		if (!seedFunc) continue;

		faker.seed(5800);

		await seedFunc();
	}

	clearAllTournamentDataCache();
}

const FINALIZED_TOURNAMENT_ID = 7;
const FINALIZED_EVENT_ID = 207;
const FINALIZED_TEAM_ID_OFFSET = 600;

async function finalizedBracket() {
	// Tournament
	await insertTournamentWithId({
		id: FINALIZED_TOURNAMENT_ID,
		mapPickingStyle: "AUTO_ALL",
		settings: JSON.stringify({
			bracketProgression: [
				{
					type: "single_elimination",
					name: "Bracket",
					requiresCheckIn: false,
					settings: { thirdPlaceMatch: false },
				},
			],
		}),
		isFinalized: 1,
	});

	// CalendarEvent
	await insertCalendarEventWithId({
		id: FINALIZED_EVENT_ID,
		name: "In The Zone 1",
		description: "Finalized tournament for testing",
		discordInviteCode: "test",
		bracketUrl: "https://example.com",
		authorId: ADMIN_ID,
		tournamentId: FINALIZED_TOURNAMENT_ID,
	});

	// CalendarEventDate — recent start time (within 7-day spoiler window)
	await db
		.insertInto("CalendarEventDate")
		.values({
			eventId: FINALIZED_EVENT_ID,
			startsAt: dateToDatabaseTimestamp(
				new Date(Date.now() - 1000 * 60 * 60 * 2),
			),
		})
		.execute();

	// 8 teams with 4 members each
	const userIds = await userIdsInAscendingOrderById();
	const teamNames = [
		"Alpha",
		"Bravo",
		"Charlie",
		"Delta",
		"Echo",
		"Foxtrot",
		"Golf",
		"Hotel",
	];

	for (let i = 0; i < 8; i++) {
		const teamId = FINALIZED_TEAM_ID_OFFSET + i + 1;

		await insertTournamentTeamWithId({
			id: teamId,
			name: teamNames[i],
			createdAt: dateToDatabaseTimestamp(new Date()),
			tournamentId: FINALIZED_TOURNAMENT_ID,
			inviteCode: shortNanoid(),
			seed: i + 1,
		});

		await db
			.insertInto("TournamentTeamCheckIn")
			.values({
				tournamentTeamId: teamId,
				checkedInAt: dateToDatabaseTimestamp(new Date()),
			})
			.execute();

		for (let j = 0; j < 4; j++) {
			await db
				.insertInto("TournamentTeamMember")
				.values({
					tournamentTeamId: teamId,
					userId: userIds.shift()!,
					createdAt: dateToDatabaseTimestamp(new Date()),
					role: j === 0 ? "OWNER" : "REGULAR",
				})
				.execute();
		}
	}

	// Bracket structure
	const { id: stageId } = await db
		.insertInto("TournamentStage")
		.values({
			tournamentId: FINALIZED_TOURNAMENT_ID,
			name: "Bracket",
			number: 1,
			type: "single_elimination",
			settings: JSON.stringify({ thirdPlaceMatch: false }),
		})
		.returning("id")
		.executeTakeFirstOrThrow();

	const { id: groupId } = await db
		.insertInto("TournamentGroup")
		.values({ stageId, number: 1 })
		.returning("id")
		.executeTakeFirstOrThrow();

	const roundMaps = JSON.stringify({ count: 3, type: "BEST_OF" });

	const roundIds: number[] = [];
	for (let r = 1; r <= 3; r++) {
		const round = await db
			.insertInto("TournamentRound")
			.values({ stageId, groupId, number: r, maps: roundMaps })
			.returning("id")
			.executeTakeFirstOrThrow();
		roundIds.push(round.id);
	}

	const t = (seed: number) => FINALIZED_TEAM_ID_OFFSET + seed;

	// SE 8-team bracket: standard seeding
	// QF: 1v8, 4v5, 2v7, 3v6
	// SF: winner(1v8) vs winner(4v5), winner(2v7) vs winner(3v6)
	// F:  winner of SF1 vs winner of SF2
	const matches = [
		// QF (round 1)
		{ round: 0, number: 1, team1: t(1), team2: t(8), winner: t(1) },
		{ round: 0, number: 2, team1: t(4), team2: t(5), winner: t(4) },
		{ round: 0, number: 3, team1: t(2), team2: t(7), winner: t(2) },
		{ round: 0, number: 4, team1: t(3), team2: t(6), winner: t(3) },
		// SF (round 2)
		{ round: 1, number: 1, team1: t(1), team2: t(4), winner: t(1) },
		{ round: 1, number: 2, team1: t(2), team2: t(3), winner: t(2) },
		// Finals (round 3)
		{ round: 2, number: 1, team1: t(1), team2: t(2), winner: t(1) },
	];

	for (const m of matches) {
		const { id: matchId } = await db
			.insertInto("TournamentMatch")
			.values({
				stageId,
				groupId,
				roundId: roundIds[m.round],
				number: m.number,
				opponentOne: JSON.stringify({
					id: m.team1,
					score: m.winner === m.team1 ? 2 : 0,
				}),
				opponentTwo: JSON.stringify({
					id: m.team2,
					score: m.winner === m.team2 ? 2 : 0,
				}),
				winnerSide: m.winner === m.team1 ? "opponent1" : "opponent2",
			})
			.returning("id")
			.executeTakeFirstOrThrow();

		// 2 game results (2-0 sweep)
		for (let g = 1; g <= 2; g++) {
			await db
				.insertInto("TournamentMatchGameResult")
				.values({
					matchId,
					mode: "SZ",
					number: g,
					reporterId: ADMIN_ID,
					source: "DEFAULT",
					stageId: 1,
					winnerTeamId: m.winner,
				})
				.execute();
		}
	}

	// TournamentResult — placements for all 8 teams
	const placements = [
		{ teamSeed: 1, placement: 1, setResults: ["W", "W", "W"] },
		{ teamSeed: 2, placement: 2, setResults: ["W", "W", "L"] },
		{ teamSeed: 3, placement: 3, setResults: ["W", "L"] },
		{ teamSeed: 4, placement: 3, setResults: ["W", "L"] },
		{ teamSeed: 5, placement: 5, setResults: ["L"] },
		{ teamSeed: 6, placement: 5, setResults: ["L"] },
		{ teamSeed: 7, placement: 5, setResults: ["L"] },
		{ teamSeed: 8, placement: 5, setResults: ["L"] },
	];

	// Insert one result row per team member
	for (const p of placements) {
		const teamId = t(p.teamSeed);
		const members = await db
			.selectFrom("TournamentTeamMember")
			.select("userId")
			.where("tournamentTeamId", "=", teamId)
			.execute();

		for (const member of members) {
			await db
				.insertInto("TournamentResult")
				.values({
					tournamentId: FINALIZED_TOURNAMENT_ID,
					tournamentTeamId: teamId,
					userId: member.userId,
					placement: p.placement,
					participantCount: 8,
					setResults: JSON.stringify(p.setResults),
				})
				.execute();
		}
	}
}

const AB_RR_TOURNAMENT_ID = 8;
const AB_RR_EVENT_ID = 208;
const AB_RR_TEAM_ID_OFFSET = 700;
const AB_RR_TEAM_COUNT = 12;

async function abDivisionsTournament() {
	await insertTournamentWithId({
		id: AB_RR_TOURNAMENT_ID,
		mapPickingStyle: "AUTO_ALL",
		settings: JSON.stringify({
			bracketProgression: [
				{
					type: "round_robin",
					name: "Groups stage",
					requiresCheckIn: false,
					settings: {
						hasAbDivisions: true,
						teamsPerGroup: AB_RR_TEAM_COUNT,
					},
				},
			],
		}),
	});

	await insertCalendarEventWithId({
		id: AB_RR_EVENT_ID,
		name: "A/B Divisions Cup",
		description: "Bipartite round robin tournament for testing",
		discordInviteCode: "abrr",
		bracketUrl: "https://example.com",
		authorId: ADMIN_ID,
		tournamentId: AB_RR_TOURNAMENT_ID,
	});

	await db
		.insertInto("CalendarEventDate")
		.values({
			eventId: AB_RR_EVENT_ID,
			startsAt: dateToDatabaseTimestamp(new Date(Date.now() - 1000 * 60 * 30)),
		})
		.execute();

	const userIds = await userIdsInAscendingOrderById();
	const now = dateToDatabaseTimestamp(new Date());

	for (let i = 0; i < AB_RR_TEAM_COUNT; i++) {
		const teamId = AB_RR_TEAM_ID_OFFSET + i + 1;

		await insertTournamentTeamWithId({
			id: teamId,
			name: `AB Team ${i + 1}`,
			createdAt: now,
			tournamentId: AB_RR_TOURNAMENT_ID,
			inviteCode: shortNanoid(),
			seed: i + 1,
		});

		await db
			.insertInto("TournamentTeamCheckIn")
			.values({ tournamentTeamId: teamId, checkedInAt: now })
			.execute();

		for (let j = 0; j < 4; j++) {
			await db
				.insertInto("TournamentTeamMember")
				.values({
					tournamentTeamId: teamId,
					userId: userIds.shift()!,
					createdAt: now,
					role: j === 0 ? "OWNER" : "REGULAR",
				})
				.execute();
		}
	}
}

async function wipeDB() {
	const tablesToDelete = [
		"ScrimPost",
		"TournamentOrganizationBannedUser",
		"Association",
		"LFGPost",
		"Skill",
		"ReportedWeapon",
		"GroupMatchMap",
		"GroupMatch",
		"Group",
		"TaggedArt",
		"ArtTag",
		"ArtUserMetadata",
		"Art",
		"UnvalidatedUserSubmittedImage",
		"AllTeamMember",
		"AllTeam",
		"Build",
		"TournamentTeamMember",
		"MapPoolMap",
		"TournamentMatchGameResult",
		"TournamentTeamCheckIn",
		"TournamentLFGLike",
		"TournamentTeam",
		"TournamentStage",
		"TournamentResult",
		"Tournament",
		"CalendarEventDate",
		"CalendarEventResultPlayer",
		"CalendarEventResultTeam",
		"CalendarEventBadge",
		"CalendarEvent",
		"UserWeapon",
		"PlusTier",
		"UnvalidatedVideo",
		"XRankPlacement",
		"SplatoonPlayer",
		"UserFriendCode",
		"NotificationUser",
		"Notification",
		"BanLog",
		"ModNote",
		"Friendship",
		"FriendRequest",
		"User",
		"PlusSuggestion",
		"PlusVote",
		"TournamentBadgeOwner",
		"BadgeManager",
		"TournamentOrganization",
		"SeedingSkill",
		"LiveStream",
		"SplatoonRotation",
	];

	for (const table of tablesToDelete) {
		if (table === "Tournament") {
			// foreign key constraint reasons
			await db
				.deleteFrom("Tournament")
				.where("parentTournamentId", "is not", null)
				.execute();
		}
		await sql`delete from ${sql.table(table)}`.execute(db);
	}
}

async function adminUser() {
	await UserRepository.upsert({
		discordId: ADMIN_DISCORD_ID,
		discordName: "Sendou",
		twitch: "Sendou",
		youtubeId: "UCWbJLXByvsfQvTcR4HLPs5Q",
		discordAvatar: ADMIN_TEST_AVATAR,
		discordUniqueName: "sendou",
	});
}

async function fixAdminId() {
	await db.deleteFrom("User").where("id", "=", ADMIN_ID).execute();
	// make admin same ID as prod for easy switching
	await sql`update "User" set "id" = ${ADMIN_ID} where id = 1`.execute(db);
}

async function makeAdminPatron() {
	await db
		.updateTable("User")
		.set({ patronTier: 2, patronStartedAt: 1674663454 })
		.where("id", "=", 1)
		.execute();
}

async function makeAdminVideoAdder() {
	await db
		.updateTable("User")
		.set({ isVideoAdder: 1 })
		.where("id", "=", 1)
		.execute();
}

async function makeAdminTournamentOrganizer() {
	await db
		.updateTable("User")
		.set({ isTournamentOrganizer: 1 })
		.where("id", "=", 1)
		.execute();
}

async function makeArtists() {
	await db
		.updateTable("User")
		.set({ isArtist: 1 })
		.where("id", "in", [ADMIN_ID, NZAP_TEST_ID])
		.execute();
}

async function adminUserWeaponPool() {
	for (const [i, weaponSplId] of [200, 1100, 2000, 4000].entries()) {
		await db
			.insertInto("UserWeapon")
			.values({
				userId: ADMIN_ID,
				weaponSplId: weaponSplId as MainWeaponId,
				order: i + 1,
			})
			.execute();
	}
}

async function adminUserWidgets() {
	await UserRepository.upsertWidgets(ADMIN_ID, [
		{
			id: "bio",
			settings: { bio: "" },
		},
		{
			id: "badges-owned",
		},
		{
			id: "teams",
		},
		{
			id: "organizations",
		},
		{
			id: "peak-sp",
		},
		{
			id: "peak-xp",
		},
	]);
}

function nzapUser() {
	return UserRepository.upsert({
		discordId: NZAP_TEST_DISCORD_ID,
		discordName: "N-ZAP",
		twitch: null,
		youtubeId: null,
		discordAvatar: NZAP_TEST_AVATAR,
		discordUniqueName: null,
	});
}

function staffUser() {
	return UserRepository.upsert({
		discordId: STAFF_TEST_DISCORD_ID,
		discordName: "Panda",
		twitch: null,
		youtubeId: null,
		discordAvatar: null,
		discordUniqueName: null,
	});
}

async function fixStaffUserId() {
	await db.deleteFrom("User").where("id", "=", STAFF_TEST_ID).execute();
	await sql`update "User" set "id" = ${STAFF_TEST_ID} where "discordId" = ${STAFF_TEST_DISCORD_ID}`.execute(
		db,
	);
}

async function users() {
	const usedNames = new Set<string>();
	for (let i = 0; i < 500; i++) {
		const args = fakeUser(usedNames)();

		await UserRepository.upsert(args);
	}
}

async function userProfiles() {
	for (const args of [
		{
			userId: ADMIN_ID,
			country: "FI",
			customUrl: "sendou",
			motionSens: 50,
			stickSens: 5,
			inGameName: "Sendou#1234",
		},
		{
			userId: 2,
			country: "SE",
			customUrl: "nzap",
			motionSens: -40,
			stickSens: 0,
			inGameName: "N-ZAP#5678",
		},
	]) {
		const { userId, ...profile } = args;

		await db
			.updateTable("User")
			.set(profile)
			.where("id", "=", userId)
			.execute();
	}

	for (let id = 2; id < 500; id++) {
		if (id === ADMIN_ID || id === NZAP_TEST_ID) continue;
		if (faker.number.float(1) < 0.25) continue; // 75% have bio

		await db
			.updateTable("User")
			.set({
				bio: faker.lorem.paragraphs(
					faker.helpers.arrayElement([1, 1, 1, 2, 3, 4]),
					"\n\n",
				),
				country:
					faker.number.float(1) > 0.5 ? faker.location.countryCode() : null,
			})
			.where("id", "=", id)
			.execute();
	}

	for (let id = 2; id < 500; id++) {
		if (id === ADMIN_ID || id === NZAP_TEST_ID) continue;
		if (faker.number.float(1) < 0.15) continue; // 85% have weapons

		const weapons = faker.helpers.shuffle(mainWeaponIds);

		for (let j = 0; j < faker.helpers.arrayElement([1, 2, 3, 4, 5]); j++) {
			await db
				.insertInto("UserWeapon")
				.values({
					userId: id,
					weaponSplId: weapons.pop()!,
					order: j + 1,
					isFavorite: faker.number.float(1) > 0.8 ? 1 : 0,
				})
				.execute();
		}
	}

	for (let id = 1; id < 500; id++) {
		const defaultLanguages: UnifiedLanguageCode[] =
			faker.number.float(1) > 0.1 ? ["en"] : [];
		if (faker.number.float(1) > 0.9) defaultLanguages.push("es");
		if (faker.number.float(1) > 0.9) defaultLanguages.push("fr");
		if (faker.number.float(1) > 0.9) defaultLanguages.push("de");
		if (faker.number.float(1) > 0.9) defaultLanguages.push("it");
		if (faker.number.float(1) > 0.9) defaultLanguages.push("ja");

		await MatchProfileRepository.updateVoiceChat({
			languages: defaultLanguages,
			userId: id,
			vc:
				faker.number.float(1) > 0.2
					? "YES"
					: faker.helpers.arrayElement(["YES", "NO", "LISTEN_ONLY"]),
		});
	}
}

/**
 * SendouQ groups draw their members from the lowest user ids, so users at or below this id are
 * guaranteed full user card data (the rest get a realistic mix of set/unset fields).
 */
const USER_CARD_SEEDED_USER_ID_CEILING = 100;

async function userCardData() {
	for (let id = 2; id < 500; id++) {
		if (id === ADMIN_ID || id === NZAP_TEST_ID) continue;

		const guaranteed = id <= USER_CARD_SEEDED_USER_ID_CEILING;

		await db
			.updateTable("User")
			.set({
				shortBio:
					guaranteed || faker.number.float(1) > 0.4
						? faker.lorem.sentence()
						: null,
				div:
					guaranteed || faker.number.float(1) > 0.5
						? faker.helpers.arrayElement(LUTI_DIVS)
						: null,
				bannerPresetImg: randomBannerPresetImg(),
				unverifiedPeakXP:
					guaranteed || faker.number.float(1) > 0.6 ? randomPeakXp() : null,
			})
			.where("id", "=", id)
			.execute();
	}
}

/** Mix of the three banner sources: null (color derived from user id), a stage banner, an explicit color. */
function randomBannerPresetImg() {
	const roll = faker.number.float(1);
	if (roll < 0.34) return null;
	if (roll < 0.67) return String(faker.helpers.arrayElement(stageIds));
	return faker.helpers.arrayElement(PRESET_COLORS);
}

/** Self-reported peak XP with exactly one division defined (the other null), as the column expects. */
function randomPeakXp() {
	const points = faker.number.int({ min: 2000, max: 3500 });
	const isTentatek = faker.datatype.boolean();

	return JSON.stringify({
		overall: points,
		tentatek: isTentatek ? points : null,
		takoroka: isTentatek ? null : points,
	});
}

const randomPreferences = (): UserMapModePreferences => {
	const modes: UserMapModePreferences["modes"] = modesShort.flatMap((mode) => {
		if (faker.number.float(1) > 0.5 && mode !== "SZ") return [];

		const criteria = mode === "SZ" ? 0.2 : 0.5;

		return {
			mode,
			preference: faker.number.float(1) > criteria ? "PREFER" : "AVOID",
		};
	});

	return {
		modes,
		pool: modesShort.flatMap((mode) => {
			const mp = modes.find((m) => m.mode === mode);
			if (mp?.preference === "AVOID") return [];

			return {
				mode,
				stages: faker.helpers
					.shuffle(stageIds)
					.filter((stageId) => !BANNED_MAPS[mode].includes(stageId))
					.slice(0, AMOUNT_OF_MAPS_IN_POOL_PER_MODE),
			};
		}),
	};
};

async function userMapModePreferences() {
	for (let id = 1; id < 500; id++) {
		if (id !== ADMIN_ID && faker.number.float(1) < 0.2) continue; // 80% have maps && admin always

		await db
			.updateTable("User")
			.where("User.id", "=", id)
			.set({
				mapModePreferences: JSON.stringify(randomPreferences()),
			})
			.execute();
	}
}

async function userMatchProfileWeaponPool() {
	const users = await db.selectFrom("User").select("id").limit(500).execute();

	for (const { id } of users) {
		if (id === NZAP_TEST_ID) continue; // no weapons for N-ZAP
		if (faker.number.float(1) < 0.2) continue; // 80% have weapons

		const weapons = faker.helpers
			.shuffle(mainWeaponIds)
			.slice(0, faker.helpers.arrayElement([1, 2, 3, 4]));

		const weaponPool = weapons.map((weaponSplId, i) => ({
			userId: id,
			sortOrder: i,
			weaponSplId,
			isFavorite: toDBBoolean(faker.number.float(1) > 0.7),
		}));

		await db.insertInto("UserWeaponPool").values(weaponPool).execute();
	}
}

async function seedingSkills() {
	const users = await db.selectFrom("User").select("id").limit(500).execute();

	for (const { id: userId } of users) {
		if (faker.number.float() < 0.7) {
			const mu = faker.number.float({ min: 22, max: 45 });
			const sigma = faker.number.float({ min: 4, max: 8 });

			await db
				.insertInto("SeedingSkill")
				.values({ userId, type: "RANKED", mu, sigma, ordinal: mu - 3 * sigma })
				.execute();
		}

		if (faker.number.float() < 0.5) {
			const mu = faker.number.float({ min: 22, max: 42 });
			const sigma = faker.number.float({ min: 4, max: 8 });

			await db
				.insertInto("SeedingSkill")
				.values({
					userId,
					type: "UNRANKED",
					mu,
					sigma,
					ordinal: mu - 3 * sigma,
				})
				.execute();
		}
	}
}

function fakeUser(usedNames: Set<string>) {
	return () => ({
		discordAvatar: null,
		discordId: String(faker.string.numeric(17)),
		discordName: uniqueDiscordName(usedNames),
		twitch: null,
		youtubeId: null,
		discordUniqueName: null,
	});
}

function uniqueDiscordName(usedNames: Set<string>) {
	let result = faker.internet.username();
	while (usedNames.has(result)) {
		result = faker.internet.username();
	}
	usedNames.add(result);

	return result;
}

const idToPlusTier = (id: number) => {
	if (id < 30 || id === ADMIN_ID) return 1;
	if (id < 80) return 2;
	if (id <= 150) return 3;

	// these ids failed the voting
	if (id >= 200 && id <= 209) return 1;
	if (id >= 210 && id <= 219) return 2;
	if (id >= 220 && id <= 229) return 3;

	throw new Error("Invalid id - no plus tier");
};

async function lastMonthsVoting() {
	const votes = [];

	const { month, year } = lastCompletedVoting(new Date());

	const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

	for (let i = 1; i < 151; i++) {
		if (i === NZAP_TEST_ID) continue; // omit N-ZAP user for testing;

		const id = i === 1 ? ADMIN_ID : i;

		votes.push({
			authorId: ADMIN_ID,
			month,
			year,
			score: 1,
			tier: idToPlusTier(id),
			becomesValidAt: dateToDatabaseTimestamp(fiveMinutesAgo),
			votedId: id,
		});
	}

	for (let id = 200; id < 225; id++) {
		votes.push({
			authorId: ADMIN_ID,
			month,
			year,
			score: -1,
			tier: idToPlusTier(id),
			becomesValidAt: dateToDatabaseTimestamp(fiveMinutesAgo),
			votedId: id,
		});
	}

	await PlusVotingRepository.upsertMany(votes);
}

async function lastMonthSuggestions() {
	const usersSuggested = [
		3, 10, 14, 90, 120, 140, 200, 201, 203, 204, 205, 216, 217, 218, 219, 220,
	];
	const { month, year } = lastCompletedVoting(new Date());

	for (const id of usersSuggested) {
		await PlusSuggestionRepository.create({
			authorId: ADMIN_ID,
			month,
			year,
			suggestedId: id,
			text: faker.lorem.lines(),
			tier: idToPlusTier(id),
		});
	}
}

async function thisMonthsSuggestions() {
	const usersInPlus = (await UserRepository.findAllPlusServerMembers()).filter(
		(u) => u.userId !== ADMIN_ID,
	);
	const range = nextNonCompletedVoting(new Date());
	invariant(range, "No next voting found");
	const { month, year } = rangeToMonthYear(range);

	for (let userId = 150; userId < 190; userId++) {
		const amountOfSuggestions = faker.helpers.arrayElement([1, 1, 2, 3, 4]);

		for (let i = 0; i < amountOfSuggestions; i++) {
			const suggester = usersInPlus.shift();
			invariant(suggester);
			invariant(suggester.plusTier);

			await PlusSuggestionRepository.create({
				authorId: suggester.userId,
				month,
				year,
				suggestedId: userId,
				text: faker.lorem.lines(),
				tier: suggester.plusTier,
			});
		}
	}
}

async function syncPlusTiers() {
	const tiers = await PlusVotingRepository.allPlusTiersFromLatestVoting();

	if (tiers.length === 0) return;

	await db
		.insertInto("PlusTier")
		.values(tiers.map(({ userId, plusTier }) => ({ userId, tier: plusTier })))
		.execute();
}

async function getAvailableBadgeIds() {
	const badges = await db.selectFrom("Badge").select("id").execute();

	return faker.helpers.shuffle(badges.map((b) => b.id));
}

const givePatron = (userId: number, patronTier: number, startedAt: Date) =>
	db
		.updateTable("User")
		.set({
			patronTier,
			patronStartedAt: dateToDatabaseTimestamp(startedAt),
		})
		.where("id", "=", userId)
		.execute();

const giveTournamentBadge = (badgeId: number, userId: number) =>
	db.insertInto("TournamentBadgeOwner").values({ badgeId, userId }).execute();

async function badgesToUsers() {
	const availableBadgeIds = await getAvailableBadgeIds();

	let userIds = (
		await db
			.selectFrom("User")
			.select("id")
			.where("id", "not in", [NZAP_TEST_ID, ADMIN_ID])
			.execute()
	).map((u) => u.id);

	for (const id of availableBadgeIds) {
		userIds = faker.helpers.shuffle(userIds);
		for (
			let i = 0;
			i <
			faker.number.int({
				min: 1,
				max: 24,
			});
			i++
		) {
			const userToGetABadge = userIds.shift()!;

			await giveTournamentBadge(id, userToGetABadge);

			userIds.push(userToGetABadge);
		}
	}

	for (const badgeId of nullFilledArray(20).map((_, i) => i + 1)) {
		await giveTournamentBadge(badgeId, ADMIN_ID);
	}

	for (const badgeId of [5, 6, 7]) {
		await giveTournamentBadge(badgeId, NZAP_TEST_ID);
	}
}

async function badgeManagers() {
	// make N-ZAP user manager of several badges
	for (let badgeId = 1; badgeId <= 10; badgeId++) {
		await db
			.insertInto("BadgeManager")
			.values({ badgeId, userId: NZAP_TEST_ID })
			.execute();
	}
}

async function patrons() {
	const userIds = (
		await db
			.selectFrom("User")
			.select("id")
			.orderBy(sql`random()`)
			.limit(50)
			.execute()
	)
		.map((u) => u.id)
		.filter(
			(id) =>
				id !== NZAP_TEST_ID && id !== ADMIN_ID && id !== ORG_ADMIN_TEST_ID,
		);

	for (const id of userIds) {
		await givePatron(
			id,
			faker.helpers.arrayElement([1, 1, 2, 2, 2, 3, 3, 4]),
			faker.date.past(),
		);
	}

	await givePatron(ADMIN_ID, 2, faker.date.past());

	// Give ORG_ADMIN_TEST_ID API access without patron status
	// so they don't get TOURNAMENT_ADDER role
	await db
		.updateTable("User")
		.set({ isApiAccesser: 1 })
		.where("id", "=", ORG_ADMIN_TEST_ID)
		.execute();
}

async function userIdsInRandomOrder(specialLast = false) {
	const rows = (
		await db.selectFrom("User").select("id").orderBy(sql`random()`).execute()
	).map((u) => u.id);

	if (!specialLast) return rows;

	return [
		...rows.filter((id) => id !== ADMIN_ID && id !== NZAP_TEST_ID),
		ADMIN_ID,
		NZAP_TEST_ID,
	];
}

async function userIdsInAscendingOrderById() {
	const ids = (
		await db.selectFrom("User").select("id").orderBy("id", "asc").execute()
	).map((u) => u.id);

	return [ADMIN_ID, ...ids.filter((id) => id !== ADMIN_ID)];
}

async function calendarEvents() {
	const userIds = await userIdsInRandomOrder();

	for (let id = 1; id <= AMOUNT_OF_CALENDAR_EVENTS; id++) {
		const shuffledTags = faker.helpers.shuffle(Object.keys(tags));

		await insertCalendarEventWithId({
			id,
			name: randomTeamName(),
			description: faker.lorem.paragraph(),
			discordInviteCode: faker.lorem.word(),
			bracketUrl: faker.internet.url(),
			authorId: id === 1 ? NZAP_TEST_ID : (userIds.pop() ?? null),
			tags:
				faker.number.float(1) > 0.2
					? JSON.stringify(
							shuffledTags.slice(
								0,
								faker.helpers.arrayElement([
									1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 4, 5, 6,
								]),
							),
						)
					: null,
		});

		const twoDayEvent = faker.number.float(1) > 0.9;
		const startTime =
			id % 2 === 0
				? faker.date.soon({ days: 42 })
				: faker.date.recent({ days: 42 });
		startTime.setMinutes(0, 0, 0);

		await db
			.insertInto("CalendarEventDate")
			.values({ eventId: id, startsAt: dateToDatabaseTimestamp(startTime) })
			.execute();

		if (twoDayEvent) {
			startTime.setDate(startTime.getDate() + 1);

			await db
				.insertInto("CalendarEventDate")
				.values({ eventId: id, startsAt: dateToDatabaseTimestamp(startTime) })
				.execute();
		}
	}
}

const addCalendarEventBadge = (eventId: number, badgeId: number) =>
	db.insertInto("CalendarEventBadge").values({ eventId, badgeId }).execute();

async function calendarEventBadges() {
	for (let eventId = 1; eventId <= AMOUNT_OF_CALENDAR_EVENTS; eventId++) {
		if (faker.number.float(1) > 0.25) continue;

		const availableBadgeIds = await getAvailableBadgeIds();

		for (
			let i = 0;
			i < faker.helpers.arrayElement([1, 1, 1, 1, 2, 2, 3]);
			i++
		) {
			await addCalendarEventBadge(eventId, availableBadgeIds.pop()!);
		}
	}
}

async function calendarEventResults() {
	let userIds = await userIdsInRandomOrder();
	const eventIdsOfPast = new Set(
		(
			await db
				.selectFrom("CalendarEvent")
				.innerJoin(
					"CalendarEventDate",
					"CalendarEventDate.eventId",
					"CalendarEvent.id",
				)
				.select("CalendarEvent.id")
				.where(
					"CalendarEventDate.startsAt",
					"<",
					dateToDatabaseTimestamp(new Date()),
				)
				.execute()
		).map((r) => r.id),
	);

	for (const eventId of eventIdsOfPast) {
		// event id = 1 needs to be without results for e2e tests
		if (faker.number.float(1) < 0.3 || eventId === 1) continue;

		await CalendarRepository.upsertReportedScores({
			eventId,
			participantCount: faker.number.int({ min: 10, max: 250 }),
			results: new Array(faker.helpers.arrayElement([1, 1, 2, 3, 3, 3, 8, 8]))
				.fill(null)
				.map((_, i) => ({
					placement: i + 1,
					teamName: randomTeamName(),
					players: new Array(
						faker.helpers.arrayElement([1, 2, 3, 4, 4, 4, 4, 4, 5, 6]),
					)
						.fill(null)
						.map(() => {
							const withStringName = faker.number.float(1) < 0.2;

							return {
								name: withStringName ? faker.person.firstName() : null,
								userId: withStringName ? null : userIds.pop()!,
							};
						}),
				})),
		});

		userIds = await userIdsInRandomOrder();
	}
}

const TO_TOOLS_CALENDAR_EVENT_ID = 201;
async function calendarEventWithToTools(
	event: "PICNIC" | "ITZ" | "PP" | "SOS" | "DEPTHS" | "LUTI" = "PICNIC",
	registrationOpen = false,
) {
	const tournamentId = {
		PICNIC: 1,
		ITZ: 2,
		PP: 3,
		SOS: 4,
		DEPTHS: 5,
		LUTI: 6,
	}[event];
	const eventId = {
		PICNIC: TO_TOOLS_CALENDAR_EVENT_ID + 0,
		ITZ: TO_TOOLS_CALENDAR_EVENT_ID + 1,
		PP: TO_TOOLS_CALENDAR_EVENT_ID + 2,
		SOS: TO_TOOLS_CALENDAR_EVENT_ID + 3,
		DEPTHS: TO_TOOLS_CALENDAR_EVENT_ID + 4,
		LUTI: TO_TOOLS_CALENDAR_EVENT_ID + 5,
	}[event];
	const name = {
		PICNIC: "PICNIC #2",
		ITZ: "In The Zone 22",
		PP: "Paddling Pool 253",
		SOS: "Swim or Sink 101",
		DEPTHS: "The Depths 5",
		LUTI: "Leagues Under The Ink Season 15",
	}[event];
	const badges = {
		PICNIC: [1, 2],
		ITZ: [3, 4],
		PP: [5, 6],
		SOS: [7, 8],
		DEPTHS: [9, 10],
		LUTI: [],
	}[event];

	const settings: Tables["Tournament"]["settings"] =
		event === "DEPTHS"
			? {
					bracketProgression: [
						{
							type: "swiss",
							name: "Swiss",
							requiresCheckIn: false,
							settings: {
								groupCount: 2,
								roundCount: 4,
							},
						},
						{
							type: "single_elimination",
							name: "Top Cut",
							requiresCheckIn: false,
							settings: {
								thirdPlaceMatch: false,
							},
							sources: [
								{
									bracketIdx: 0,
									placements: [1, 2, 3, 4],
								},
							],
						},
					],
					enableNoScreenToggle: true,
					isRanked: false,
				}
			: event === "SOS"
				? {
						bracketProgression: [
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
						],
						enableNoScreenToggle: true,
					}
				: event === "PP"
					? {
							bracketProgression: [
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
								{
									type: "single_elimination",
									name: "Underground bracket",
									requiresCheckIn: true,
									settings: {},
									sources: [{ bracketIdx: 0, placements: [3, 4] }],
								},
							],
						}
					: event === "ITZ"
						? {
								bracketProgression: [
									{
										type: "double_elimination",
										name: "Main bracket",
										requiresCheckIn: false,
										settings: {},
									},
									{
										type: "single_elimination",
										name: "Underground bracket",
										requiresCheckIn: false,
										settings: {},
										sources: [{ bracketIdx: 0, placements: [-1, -2] }],
									},
								],
							}
						: event === "LUTI"
							? {
									bracketProgression: [
										{
											type: "round_robin",
											name: "Groups stage",
											requiresCheckIn: false,
											settings: {},
										},
										{
											type: "single_elimination",
											name: "Play-offs",
											requiresCheckIn: false,
											settings: {},
											sources: [{ bracketIdx: 0, placements: [1, 2] }],
										},
									],
								}
							: {
									bracketProgression: [
										{
											type: "double_elimination",
											name: "Main bracket",
											requiresCheckIn: false,
											settings: {},
										},
									],
								};

	await insertTournamentWithId({
		id: tournamentId,
		settings: JSON.stringify(settings),
		mapPickingStyle:
			event === "SOS" || event === "LUTI"
				? "TO"
				: event === "ITZ"
					? "AUTO_SZ"
					: "AUTO_ALL",
	});

	await insertCalendarEventWithId({
		id: eventId,
		name,
		description: faker.lorem.paragraph(),
		discordInviteCode: faker.lorem.word(),
		bracketUrl: faker.internet.url(),
		authorId: ADMIN_ID,
		tournamentId,
		organizationId: event === "PICNIC" ? 1 : null,
		avatarImgId: getTournamentImageId(tournamentId),
	});

	const halfAnHourFromNow = new Date(Date.now() + 1000 * 60 * 30);

	await db
		.insertInto("CalendarEventDate")
		.values({
			eventId,
			startsAt: dateToDatabaseTimestamp(
				registrationOpen
					? halfAnHourFromNow
					: new Date(Date.now() - 1000 * 60 * 60),
			),
		})
		.execute();

	for (const badgeId of badges) {
		await addCalendarEventBadge(eventId, badgeId);
	}
}

const tiebreakerPicks = new MapPool([
	{ mode: "SZ", stageId: 1 },
	{ mode: "TC", stageId: 2 },
	{ mode: "RM", stageId: 3 },
	{ mode: "CB", stageId: 4 },
]);
async function calendarEventWithToToolsTieBreakerMapPool() {
	for (const tieBreakerCalendarEventId of [
		TO_TOOLS_CALENDAR_EVENT_ID, // PICNIC
		TO_TOOLS_CALENDAR_EVENT_ID + 2, // Paddling Pool
		TO_TOOLS_CALENDAR_EVENT_ID + 4, // The Depths
	]) {
		for (const { mode, stageId } of tiebreakerPicks.stageModePairs) {
			await db
				.insertInto("MapPoolMap")
				.values({ tieBreakerCalendarEventId, stageId, mode })
				.execute();
		}
	}
}

async function calendarEventWithToToolsToSetMapPool() {
	const stages = [
		...SENDOUQ_DEFAULT_MAPS.SZ.map((stageId) => ({ mode: "SZ", stageId })),
		...SENDOUQ_DEFAULT_MAPS.TC.map((stageId) => ({ mode: "TC", stageId })),
		...SENDOUQ_DEFAULT_MAPS.RM.map((stageId) => ({ mode: "RM", stageId })),
		...SENDOUQ_DEFAULT_MAPS.CB.map((stageId) => ({ mode: "CB", stageId })),
	] as Array<{ mode: ModeShort; stageId: StageId }>;

	for (const { mode, stageId } of stages) {
		await db
			.insertInto("MapPoolMap")
			.values({
				calendarEventId: TO_TOOLS_CALENDAR_EVENT_ID + 3,
				stageId,
				mode,
			})
			.execute();
	}
}

const validTournamentTeamName = () => randomTeamName();

const availableStages: StageId[] = [1, 2, 3, 4, 6, 7, 8, 10, 11];
const availablePairs = rankedModesShort
	.flatMap((mode) =>
		availableStages.map((stageId) => ({ mode, stageId: stageId })),
	)
	.filter((pair) => !tiebreakerPicks.has(pair));
async function calendarEventWithToToolsTeams(
	event: "PICNIC" | "ITZ" | "PP" | "SOS" | "DEPTHS" | "LUTI" = "PICNIC",
	isSmall = false,
) {
	const userIds = await userIdsInAscendingOrderById();
	const names = Array.from(
		new Set(new Array(100).fill(null).map(() => validTournamentTeamName())),
	).concat("Chimera");

	const tournamentId = {
		PICNIC: 1,
		ITZ: 2,
		PP: 3,
		SOS: 4,
		DEPTHS: 5,
		LUTI: 6,
	}[event];

	const teamIdAddition = {
		PICNIC: 0,
		ITZ: 100,
		PP: 200,
		SOS: 300,
		DEPTHS: 400,
		LUTI: 500,
	}[event];

	for (let id = 1; id <= (isSmall ? 4 : 16); id++) {
		const teamId = id + teamIdAddition;

		const name = names.pop();
		invariant(name, "tournament team name is falsy");

		await insertTournamentTeamWithId({
			id: teamId,
			name,
			createdAt: dateToDatabaseTimestamp(new Date()),
			tournamentId,
			inviteCode: shortNanoid(),
			seed: id,
		});

		// in PICNIC & PP Chimera is not checked in + in LUTI no check-ins at all
		if (teamId !== 1 && teamId !== 201 && event !== "LUTI") {
			await db
				.insertInto("TournamentTeamCheckIn")
				.values({
					tournamentTeamId: teamId,
					checkedInAt: dateToDatabaseTimestamp(new Date()),
				})
				.execute();
		}

		for (let i = 0; i < (id < 10 ? 4 : 5); i++) {
			let userId = userIds.shift()!;
			// ensure N-ZAP is in different team than Sendou for ITZ
			if (userId === NZAP_TEST_ID && teamId === 101) {
				userId = userIds.shift()!;
				userIds.unshift(NZAP_TEST_ID);
			}

			// prevent everyone showing as subs
			const yesterday = new Date();
			yesterday.setDate(yesterday.getDate() - 1);

			await db
				.insertInto("TournamentTeamMember")
				.values({
					tournamentTeamId: id + teamIdAddition,
					userId,
					createdAt: dateToDatabaseTimestamp(yesterday),
					role: i === 0 ? "OWNER" : "REGULAR",
				})
				.execute();
		}

		if (
			event !== "SOS" &&
			event !== "LUTI" &&
			(faker.number.float(1) < 0.8 || id === 1)
		) {
			const shuffledPairs = faker.helpers.shuffle(availablePairs.slice());

			let SZ = 0;
			let TC = 0;
			let RM = 0;
			let CB = 0;
			const stageUsedCounts: Partial<Record<StageId, number>> = {};

			for (const pair of shuffledPairs) {
				if (event === "ITZ" && pair.mode !== "SZ") continue;
				if (BANNED_MAPS[pair.mode].includes(pair.stageId)) {
					continue;
				}

				if (pair.mode === "SZ" && SZ >= (event === "ITZ" ? 6 : 2)) continue;
				if (pair.mode === "TC" && TC >= 2) continue;
				if (pair.mode === "RM" && RM >= 2) continue;
				if (pair.mode === "CB" && CB >= 2) continue;

				if (stageUsedCounts[pair.stageId] === (event === "ITZ" ? 1 : 2))
					continue;

				stageUsedCounts[pair.stageId] =
					(stageUsedCounts[pair.stageId] ?? 0) + 1;

				await db
					.insertInto("MapPoolMap")
					.values({
						tournamentTeamId: id + teamIdAddition,
						stageId: pair.stageId,
						mode: pair.mode,
					})
					.execute();

				if (pair.mode === "SZ") SZ++;
				if (pair.mode === "TC") TC++;
				if (pair.mode === "RM") RM++;
				if (pair.mode === "CB") CB++;
			}
		}
	}
}

async function tournamentLfgGroups() {
	const availableUsers = (await userIdsInAscendingOrderById()).slice(300);

	const MAX_GROUP_SIZE = 6;

	// Add admin's friends to tournament LFG so sidebar shows tournament friends
	for (const friendId of SENDOU_FRIEND_IDS_IN_TOURNAMENT_LFG) {
		await TournamentLFGRepository.createPlaceholderTeam({
			tournamentId: 1,
			userId: friendId,
		});
	}

	const tournaments = [1, 2, 3];

	let userIndex = 0;
	for (const tournamentId of tournaments) {
		const users = availableUsers.slice(userIndex, userIndex + 8);
		userIndex += 8;

		// Group 1: solo placeholder, has note, isStayAsSub=1
		const { id: team1Id } = await TournamentLFGRepository.createPlaceholderTeam(
			{
				tournamentId,
				userId: users[0],
				isStayAsSub: true,
			},
		);
		await TournamentLFGRepository.updateTeamNote({
			teamId: team1Id,
			value: "Looking for a team, can play any role",
		});

		// Group 2: solo placeholder
		const { id: team2Id } = await TournamentLFGRepository.createPlaceholderTeam(
			{
				tournamentId,
				userId: users[1],
			},
		);

		// Group 3: solo placeholder
		const { id: team3Id } = await TournamentLFGRepository.createPlaceholderTeam(
			{
				tournamentId,
				userId: users[2],
			},
		);

		// Group 4: solo placeholder
		const { id: team4Id } = await TournamentLFGRepository.createPlaceholderTeam(
			{
				tournamentId,
				userId: users[3],
			},
		);

		// Group 5: 2-member group (merged from two placeholders)
		const { id: mergeTarget1 } =
			await TournamentLFGRepository.createPlaceholderTeam({
				tournamentId,
				userId: users[4],
			});
		const { id: mergeSource1 } =
			await TournamentLFGRepository.createPlaceholderTeam({
				tournamentId,
				userId: users[5],
			});
		await TournamentLFGRepository.mergeTeams({
			survivingTeamId: mergeTarget1,
			otherTeamId: mergeSource1,
			maxGroupSize: MAX_GROUP_SIZE,
		});

		// Group 6: 2-member group (merged from two placeholders)
		const { id: mergeTarget2 } =
			await TournamentLFGRepository.createPlaceholderTeam({
				tournamentId,
				userId: users[6],
			});
		const { id: mergeSource2 } =
			await TournamentLFGRepository.createPlaceholderTeam({
				tournamentId,
				userId: users[7],
			});
		await TournamentLFGRepository.mergeTeams({
			survivingTeamId: mergeTarget2,
			otherTeamId: mergeSource2,
			maxGroupSize: MAX_GROUP_SIZE,
		});

		// Team 1 -> Team 2 (one-way like)
		await TournamentLFGRepository.addLike({
			likerTeamId: team1Id,
			targetTeamId: team2Id,
		});
		// Team 2 -> Team 1 (mutual — tests invitation UI)
		await TournamentLFGRepository.addLike({
			likerTeamId: team2Id,
			targetTeamId: team1Id,
		});
		// Team 3 -> Team 4 (one-way like)
		await TournamentLFGRepository.addLike({
			likerTeamId: team3Id,
			targetTeamId: team4Id,
		});
	}
}

const randomAbility = (legalTypes: AbilityType[]) => {
	const randomOrderAbilities = faker.helpers.shuffle([...abilities]);

	return randomOrderAbilities.find((a) => legalTypes.includes(a.type))!.name;
};

const canonicalMainWeaponIds = mainWeaponIds.filter(
	(id) => canonicalWeaponSplId(id) === id,
);
const adminWeaponPool = canonicalMainWeaponIds.filter(
	() => faker.number.float(1) > 0.8,
);
async function adminBuilds() {
	for (let i = 0; i < 50; i++) {
		const randomOrderHeadGear = faker.helpers.shuffle(headGearIds.slice());
		const randomOrderClothesGear = faker.helpers.shuffle(
			clothesGearIds.slice(),
		);
		const randomOrderShoesGear = faker.helpers.shuffle(shoesGearIds.slice());
		// filter out sshot to prevent test flaking
		const randomOrderWeaponIds = faker.helpers.shuffle(
			adminWeaponPool.filter((id) => id !== 40).slice(),
		);

		await BuildRepository.create({
			title: `${R.capitalize(faker.word.adjective())} ${R.capitalize(
				faker.word.noun(),
			)}`,
			ownerId: ADMIN_ID,
			isPrivate: 0,
			description:
				faker.number.float(1) < 0.75 ? faker.lorem.paragraph() : null,
			headGearSplId: randomOrderHeadGear[0],
			clothesGearSplId: randomOrderClothesGear[0],
			shoesGearSplId: randomOrderShoesGear[0],
			weaponSplIds: new Array(
				faker.helpers.arrayElement([1, 1, 1, 2, 2, 3, 4, 5]),
			)
				.fill(null)
				.map(() => randomOrderWeaponIds.pop()!),
			modes:
				faker.number.float(1) < 0.75
					? modesShort.filter(() => faker.number.float(1) < 0.5)
					: null,
			abilities: [
				[
					randomAbility(["HEAD_MAIN_ONLY", "STACKABLE"]),
					randomAbility(["STACKABLE"]),
					randomAbility(["STACKABLE"]),
					randomAbility(["STACKABLE"]),
				],
				[
					randomAbility(["CLOTHES_MAIN_ONLY", "STACKABLE"]),
					randomAbility(["STACKABLE"]),
					randomAbility(["STACKABLE"]),
					randomAbility(["STACKABLE"]),
				],
				[
					randomAbility(["SHOES_MAIN_ONLY", "STACKABLE"]),
					randomAbility(["STACKABLE"]),
					randomAbility(["STACKABLE"]),
					randomAbility(["STACKABLE"]),
				],
			],
		});
	}
}

async function manySplattershotBuilds() {
	// ensure 500 has at least one splattershot build for x placement test
	const users = [
		...(await userIdsInRandomOrder()).filter(
			(id) => id !== 500 && id !== ADMIN_ID && id !== NZAP_TEST_ID,
		),
		500,
	];

	for (let i = 0; i < 499; i++) {
		const SPLATTERSHOT_ID = 40;

		const randomOrderHeadGear = faker.helpers.shuffle(headGearIds.slice());
		const randomOrderClothesGear = faker.helpers.shuffle(
			clothesGearIds.slice(),
		);
		const randomOrderShoesGear = faker.helpers.shuffle(shoesGearIds.slice());
		const randomOrderWeaponIds = faker.helpers
			.shuffle(canonicalMainWeaponIds.slice())
			.filter((id) => id !== SPLATTERSHOT_ID);

		const ownerId = users.pop()!;

		await BuildRepository.create({
			isPrivate: 0,
			title: `${R.capitalize(faker.word.adjective())} ${R.capitalize(
				faker.word.noun(),
			)}`,
			ownerId,
			description:
				faker.number.float(1) < 0.75 ? faker.lorem.paragraph() : null,
			headGearSplId: randomOrderHeadGear[0],
			clothesGearSplId: randomOrderClothesGear[0],
			shoesGearSplId: randomOrderShoesGear[0],
			weaponSplIds: new Array(
				faker.helpers.arrayElement([1, 1, 1, 2, 2, 3, 4, 5]),
			)
				.fill(null)
				.map((_, i) =>
					i === 0 ? SPLATTERSHOT_ID : randomOrderWeaponIds.pop()!,
				),
			modes:
				faker.number.float(1) < 0.75
					? modesShort.filter(() => faker.number.float(1) < 0.5)
					: null,
			abilities: [
				[
					randomAbility(["HEAD_MAIN_ONLY", "STACKABLE"]),
					randomAbility(["STACKABLE"]),
					randomAbility(["STACKABLE"]),
					randomAbility(["STACKABLE"]),
				],
				[
					randomAbility(["CLOTHES_MAIN_ONLY", "STACKABLE"]),
					randomAbility(["STACKABLE"]),
					randomAbility(["STACKABLE"]),
					randomAbility(["STACKABLE"]),
				],
				[
					randomAbility(["SHOES_MAIN_ONLY", "STACKABLE"]),
					randomAbility(["STACKABLE"]),
					randomAbility(["STACKABLE"]),
					randomAbility(["STACKABLE"]),
				],
			],
		});
	}
}

const detailedTeam = (seedVariation?: SeedVariation | null) => async () => {
	await db
		.insertInto("AllTeam")
		.values({
			name: "Alliance Rogue",
			customUrl: "alliance-rogue",
			inviteCode: shortNanoid(),
			bio: faker.lorem.paragraph(),
			avatarImgId: getTeamImageId(1),
		})
		.execute();

	const userIds = (await userIdsInRandomOrder(true)).filter(
		(id) => id !== NZAP_TEST_ID,
	);
	if (seedVariation === "NZAP_IN_TEAM") {
		userIds.unshift(NZAP_TEST_ID);
	}
	for (let i = 0; i < 5; i++) {
		const userId = i === 0 ? ADMIN_ID : userIds.shift()!;

		await db
			.insertInto("AllTeamMember")
			.values({
				teamId: 1,
				userId,
				role: i === 0 ? "CAPTAIN" : "FRONTLINE",
				isOwner: i === 0 ? 1 : 0,
				leftAt: i < 4 ? null : 1672587342,
				order: i,
			})
			.execute();
	}

	const teamPreferences: UserMapModePreferences = {
		modes: modesShort.map((mode) => ({ mode, preference: "PREFER" as const })),
		pool: modesShort.map((mode) => ({
			mode,
			stages: [...SENDOUQ_DEFAULT_MAPS[mode]],
		})),
	};

	await db
		.updateTable("AllTeam")
		.set({ mapModePreferences: JSON.stringify(teamPreferences) })
		.where("id", "=", 1)
		.execute();
};

async function otherTeams() {
	const usersInTeam = (
		await db.selectFrom("AllTeamMember").select("userId").execute()
	).map((row) => row.userId);

	const userIds = (await userIdsInRandomOrder()).filter(
		(u) => !usersInTeam.includes(u) && u !== NZAP_TEST_ID,
	);

	for (let i = 3; i < 50; i++) {
		const teamName = i === 3 ? "Team Olive" : randomTeamName();
		const teamCustomUrl = mySlugify(teamName);

		await sql`
			insert into "AllTeam" ("id", "name", "customUrl", "inviteCode", "bio")
			values (${i}, ${teamName}, ${teamCustomUrl}, ${shortNanoid()}, ${faker.lorem.paragraph()})
		`.execute(db);

		const numMembers = faker.helpers.arrayElement([
			1, 2, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 7, 7, 8,
		]);
		for (let j = 0; j < numMembers; j++) {
			await db
				.insertInto("AllTeamMember")
				.values({
					teamId: i,
					userId: userIds.shift()!,
					role: j === 0 ? "CAPTAIN" : "FRONTLINE",
					isOwner: j === 0 ? 1 : 0,
					order: j,
				})
				.execute();
		}
	}
}

async function realVideo() {
	const userIds = await userIdsInRandomOrder();

	for (let i = 0; i < 5; i++) {
		await VodRepository.insert({
			type: "TOURNAMENT",
			youtubeUrl: youtubeIdToYoutubeUrl("M4aV-BQWlVg"),
			date: { day: 2, month: 2, year: 2023 },
			submitterUserId: ADMIN_ID,
			title: "LUTI Division X Tournament - ABBF (THRONE) vs. Ascension",
			pov: {
				type: "USER",
				userId: faker.helpers.arrayElement(userIds),
			},
			isValidated: true,
			matches: [
				{
					mode: "SZ",
					stageId: 8,
					startsAt: secondsToHoursMinutesSecondString(13),
					weapons: [3040],
				},
				{
					mode: "CB",
					stageId: 6,
					startsAt: secondsToHoursMinutesSecondString(307),
					weapons: [3040],
				},
				{
					mode: "TC",
					stageId: 2,
					startsAt: secondsToHoursMinutesSecondString(680),
					weapons: [3040],
				},
				{
					mode: "SZ",
					stageId: 9,
					startsAt: secondsToHoursMinutesSecondString(1186),
					weapons: [3040],
				},
				{
					mode: "RM",
					stageId: 2,
					startsAt: secondsToHoursMinutesSecondString(1386),
					weapons: [3000],
				},
				{
					mode: "TC",
					stageId: 4,
					startsAt: secondsToHoursMinutesSecondString(1586),
					weapons: [1110],
				},
				// there are other matches too...
			],
		});
	}
}

async function realVideoCast() {
	await VodRepository.insert({
		type: "CAST",
		youtubeUrl: youtubeIdToYoutubeUrl("M4aV-BQWlVg"),
		date: { day: 2, month: 2, year: 2023 },
		submitterUserId: ADMIN_ID,
		title: "LUTI Division X Tournament - ABBF (THRONE) vs. Ascension",
		isValidated: true,
		matches: [
			{
				mode: "SZ",
				stageId: 8,
				startsAt: secondsToHoursMinutesSecondString(13),
				weapons: [3040, 1000, 2000, 4000, 5000, 6000, 7010, 8000],
			},
			{
				mode: "CB",
				stageId: 6,
				startsAt: secondsToHoursMinutesSecondString(307),
				weapons: [3040, 1001, 2010, 4001, 5001, 6010, 7020, 8010],
			},
			{
				mode: "TC",
				stageId: 2,
				startsAt: secondsToHoursMinutesSecondString(680),
				weapons: [3040, 1010, 2020, 4010, 5010, 6020, 7010, 8000],
			},
			{
				mode: "SZ",
				stageId: 9,
				startsAt: secondsToHoursMinutesSecondString(1186),
				weapons: [3040, 1020, 2030, 4020, 5020, 6020, 7020, 8010],
			},
			// there are other matches too...
		],
	});
}

// some copy+paste from placements script
function xRankPlacements() {
	return db.transaction().execute(async (trx) => {
		for (const [i, placement] of placements.entries()) {
			const userId = () => {
				// admin
				if (placement.playerSplId === "qx6imlx72tfeqrhqfnmm") return ADMIN_ID;
				// user in top 500 who is not plus server member
				if (i === 0) return 500;

				return null;
			};

			await trx
				.insertInto("SplatoonPlayer")
				.values({ splId: placement.playerSplId, userId: userId() })
				.onConflict((oc) => oc.column("splId").doNothing())
				.execute();

			const { playerSplId, ...rest } = placement;
			await trx
				.insertInto("XRankPlacement")
				.values({
					...rest,
					mode: rest.mode as ModeShort,
					region: rest.region as Tables["XRankPlacement"]["region"],
					weaponSplId: rest.weaponSplId as MainWeaponId,
					playerId: (eb) =>
						eb
							.selectFrom("SplatoonPlayer")
							.select("SplatoonPlayer.id")
							.where("splId", "=", playerSplId),
				})
				.execute();
		}
	});
}

const addUnvalidatedUserSubmittedImage = (url: string, authorId: number) =>
	db
		.insertInto("UnvalidatedUserSubmittedImage")
		.values({
			validatedAt: dateToDatabaseTimestamp(new Date()),
			url,
			submitterUserId: authorId,
		})
		.returning("id")
		.executeTakeFirstOrThrow();

const teamAndTournamentImages = new Map<string, number>();

async function insertTeamAndTournamentImages() {
	for (const { filename } of [...SEED_TEAM_IMAGES, ...SEED_TOURNAMENT_IMAGES]) {
		const image = await addUnvalidatedUserSubmittedImage(filename, ADMIN_ID);
		teamAndTournamentImages.set(filename, image.id);
	}
}

function getTeamImageId(teamId: number): number | null {
	const teamImage = SEED_TEAM_IMAGES.find((img) => img.teamId === teamId);
	if (!teamImage) return null;
	return teamAndTournamentImages.get(teamImage.filename) ?? null;
}

function getTournamentImageId(tournamentId: number): number | null {
	const tournamentImage = SEED_TOURNAMENT_IMAGES.find(
		(img) => img.tournamentId === tournamentId,
	);
	if (!tournamentImage) return null;
	return teamAndTournamentImages.get(tournamentImage.filename) ?? null;
}
const artImgFilenames = Array.from({ length: SEED_ART_URLS.length }, (_, i) =>
	getArtFilename(i),
);

async function arts() {
	const artUsers = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
	const allUsers = await userIdsInRandomOrder();
	const urls = [...artImgFilenames];

	for (const userId of artUsers) {
		for (let i = 0; i < faker.helpers.arrayElement([1, 2, 3, 3, 3, 4]); i++) {
			const url = urls.pop()!;
			if (!url) break;

			const image = await addUnvalidatedUserSubmittedImage(url, userId);

			const addedArt = await db
				.insertInto("Art")
				.values({
					imgId: image.id,
					authorId: userId,
					isShowcase: i === 0 ? 1 : 0,
					description:
						faker.number.float(1) > 0.5 ? faker.lorem.paragraph() : null,
				})
				.returning("id")
				.executeTakeFirstOrThrow();

			if (i === 1) {
				for (
					let i = 0;
					i < faker.helpers.arrayElement([1, 1, 1, 1, 2, 4]);
					i++
				) {
					await db
						.insertInto("ArtUserMetadata")
						.values({
							artId: addedArt.id,
							userId: i === 0 ? NZAP_TEST_ID : allUsers.pop()!,
						})
						.execute();
				}
			}
		}
	}
}

async function commissionsOpen() {
	const allUsers = await userIdsInRandomOrder();

	for (const userId of allUsers) {
		if (faker.number.float(1) > 0.5) {
			await db
				.updateTable("User")
				.set({ commissionsOpen: 1, commissionText: faker.lorem.paragraph() })
				.where("id", "=", userId)
				.execute();
		}
	}
}

const SENDOU_IN_FULL_GROUP = true;
async function groups(variation?: SeedVariation | null) {
	if (variation === "TEAM_MAP_PREFS") {
		return teamMapPrefsGroups();
	}

	const users = (await userIdsInAscendingOrderById())
		.slice(0, 100)
		.filter((id) => id !== ADMIN_ID && id !== NZAP_TEST_ID);
	users.push(NZAP_TEST_ID);

	let nzapGroupId = 0;
	let sendouGroupId = 0;
	const nzapGroupMemberIds: number[] = [];
	const sendouGroupMemberIds: number[] = [];

	for (let i = 0; i < 25; i++) {
		const ownerId = users.pop()!;
		const group = await SQGroupRepository.createGroup({
			status: "ACTIVE",
			userId: ownerId,
		});

		if (i === 0) nzapGroupMemberIds.push(ownerId);
		if (i === 1) sendouGroupMemberIds.push(ownerId);

		const amountOfAdditionalMembers = () => {
			if (SENDOU_IN_FULL_GROUP) {
				if (i === 0) return 3;
				if (i === 1) return 3;
			}

			return i === 0 ? 2 : i % 4;
		};

		for (let j = 0; j < amountOfAdditionalMembers(); j++) {
			const memberId = users.pop()!;
			await addGroupMember(group.id, memberId);

			if (i === 0) nzapGroupMemberIds.push(memberId);
			if (i === 1) sendouGroupMemberIds.push(memberId);
		}

		if (i === 0) nzapGroupId = group.id;
		if (i === 1) sendouGroupId = group.id;

		if (i === 0 && SENDOU_IN_FULL_GROUP) {
			users.push(ADMIN_ID);
		}
	}

	if (variation === "IN_SQ_MATCH") {
		// Sendou's side tests the matchmade cascade vote flow, NZAP's side
		// tests the trusted one-click flow.
		await db
			.updateTable("Group")
			.set({ matchmade: 1 })
			.where("id", "=", sendouGroupId)
			.execute();
		await db
			.updateTable("Group")
			.set({ matchmade: 0 })
			.where("id", "=", nzapGroupId)
			.execute();

		const mapList = randomMapList(sendouGroupId, nzapGroupId);
		const memento = buildSeedMemento({
			mapList,
			alphaGroupId: sendouGroupId,
			bravoGroupId: nzapGroupId,
			alphaMemberIds: sendouGroupMemberIds,
			bravoMemberIds: nzapGroupMemberIds,
		});

		const createdMatch = await SQMatchRepository.create({
			alphaGroupId: sendouGroupId,
			bravoGroupId: nzapGroupId,
			mapList,
			memento,
		});

		const guaranteedWeaponPoolUserIds = [
			sendouGroupMemberIds[1],
			sendouGroupMemberIds[2],
			nzapGroupMemberIds[1],
			nzapGroupMemberIds[2],
		].filter((id): id is number => typeof id === "number");
		for (const userId of guaranteedWeaponPoolUserIds) {
			const weapons: Array<{
				weaponSplId: MainWeaponId;
				isFavorite: DBBoolean;
			}> = [
				{ weaponSplId: 0, isFavorite: 1 },
				{ weaponSplId: 2000, isFavorite: 0 },
				{ weaponSplId: 4000, isFavorite: 0 },
			];
			await db
				.insertInto("UserWeaponPool")
				.values(
					weapons.map((w, i) => ({
						userId,
						sortOrder: i,
						weaponSplId: w.weaponSplId,
						isFavorite: w.isFavorite,
					})),
				)
				.onConflict((oc) => oc.doNothing())
				.execute();
		}

		if (createdMatch.chatCode) {
			await ChatSystemMessage.setMetadata({
				chatCode: createdMatch.chatCode,
				header: `Match #${createdMatch.id}`,
				subtitle: "SendouQ",
				url: sendouQMatchPage(createdMatch.id),
				imageUrl: `${navIconUrl("sendouq")}.avif`,
				participantUserIds: [...sendouGroupMemberIds, ...nzapGroupMemberIds],
				expiresAfter: { hours: 2 },
			});
		}
	}
}

async function teamMapPrefsGroups() {
	const arMemberIds = (
		await db
			.selectFrom("AllTeamMember")
			.select("userId")
			.where("teamId", "=", 1)
			.where("leftAt", "is", null)
			.where("userId", "!=", ADMIN_ID)
			.execute()
	).map((row) => row.userId);

	const arMemberSet = new Set(arMemberIds);
	const users = (await userIdsInAscendingOrderById())
		.slice(0, 100)
		.filter(
			(id) => id !== ADMIN_ID && id !== NZAP_TEST_ID && !arMemberSet.has(id),
		);

	const nzapGroup = await SQGroupRepository.createGroup({
		status: "ACTIVE",
		userId: NZAP_TEST_ID,
	});
	for (let j = 0; j < 3; j++) {
		await addGroupMember(nzapGroup.id, users.pop()!);
	}

	const adminGroup = await SQGroupRepository.createGroup({
		status: "ACTIVE",
		userId: ADMIN_ID,
	});
	for (const memberId of arMemberIds) {
		await addGroupMember(adminGroup.id, memberId);
	}

	await db
		.updateTable("Group")
		.set({ teamId: 1 })
		.where("id", "=", adminGroup.id)
		.execute();
}

const randomMapList = (
	groupAlpha: number,
	groupBravo: number,
): TournamentMapListMap[] => {
	const szOnly = faker.helpers.arrayElement([true, false]);

	let modePattern = faker.helpers
		.shuffle([...modesShort])
		.filter(() => faker.number.float(1) > 0.15);
	if (modePattern.length === 0) {
		modePattern = faker.helpers.shuffle([...rankedModesShort]);
	}

	const mapList: TournamentMapListMap[] = [];
	const stageIdsShuffled = faker.helpers.shuffle([...stageIds]);

	for (let i = 0; i < 7; i++) {
		const mode = modePattern.pop()!;
		mapList.push({
			mode: szOnly ? "SZ" : mode,
			stageId: stageIdsShuffled.pop()!,
			source: i === 6 ? "BOTH" : i % 2 === 0 ? groupAlpha : groupBravo,
		});

		modePattern.unshift(mode);
	}

	return mapList;
};

function buildSeedMemento({
	mapList,
	alphaGroupId,
	bravoGroupId,
	alphaMemberIds,
	bravoMemberIds,
}: {
	mapList: TournamentMapListMap[];
	alphaGroupId: number;
	bravoGroupId: number;
	alphaMemberIds: number[];
	bravoMemberIds: number[];
}): ParsedMemento {
	const userPools = new Map<number, Map<ModeShort, Set<StageId>>>();

	const addVote = (userId: number, mode: ModeShort, stageId: StageId) => {
		let modes = userPools.get(userId);
		if (!modes) {
			modes = new Map();
			userPools.set(userId, modes);
		}
		let stages = modes.get(mode);
		if (!stages) {
			stages = new Set();
			modes.set(mode, stages);
		}
		stages.add(stageId);
	};

	for (const map of mapList) {
		const candidates: number[] =
			map.source === "BOTH"
				? [...alphaMemberIds, ...bravoMemberIds]
				: map.source === alphaGroupId
					? alphaMemberIds
					: map.source === bravoGroupId
						? bravoMemberIds
						: [];

		if (candidates.length === 0) continue;

		const voterCount = faker.number.int({ min: 1, max: candidates.length });
		const voters = faker.helpers.arrayElements(candidates, voterCount);

		for (const voterId of voters) {
			addVote(voterId, map.mode, map.stageId);
		}
	}

	const pools: ParsedMemento["pools"] = Array.from(userPools.entries()).map(
		([userId, modes]) => ({
			userId,
			pool: Array.from(modes.entries()).map(([mode, stages]) => ({
				mode,
				stages: Array.from(stages),
			})),
		}),
	);

	const tierNames = [
		"LEVIATHAN",
		"DIAMOND",
		"PLATINUM",
		"GOLD",
		"SILVER",
		"BRONZE",
		"IRON",
	] as const;

	const users: ParsedMemento["users"] = {};
	for (const userId of [...alphaMemberIds, ...bravoMemberIds]) {
		const tierName = faker.helpers.arrayElement(tierNames);
		users[userId] = {
			skill: {
				ordinal: faker.number.float({ min: 1000, max: 3000 }),
				tier: {
					name: tierName,
					isPlus: faker.datatype.boolean(),
				},
				approximate: false,
			},
		};
	}

	const groups: ParsedMemento["groups"] = {
		[alphaGroupId]: {
			tier: {
				name: faker.helpers.arrayElement(tierNames),
				isPlus: faker.datatype.boolean(),
			},
		},
		[bravoGroupId]: {
			tier: {
				name: faker.helpers.arrayElement(tierNames),
				isPlus: faker.datatype.boolean(),
			},
		},
	};

	return { users, groups, pools };
}

const MATCHES_COUNT = 500;

const AMOUNT_OF_USERS_WITH_SKILLS = 100;

async function playedMatches() {
	const userIdsWithSkills = (await userIdsInAscendingOrderById()).slice(
		0,
		AMOUNT_OF_USERS_WITH_SKILLS,
	);

	const _groupMembers = new Array(AMOUNT_OF_USERS_WITH_SKILLS)
		.fill(null)
		.map(() => {
			const users = faker.helpers.shuffle(userIdsWithSkills);

			return new Array(4).fill(null).map(() => users.pop()!);
		});
	const defaultWeapons: Record<number, MainWeaponId> = Object.fromEntries(
		userIdsWithSkills.map((id) => {
			const weapons = faker.helpers.shuffle([...mainWeaponIds]);
			return [id, weapons[0]];
		}),
	);

	let matchDate = new Date(Date.UTC(2023, 9, 15, 0, 0, 0, 0));
	for (let i = 0; i < MATCHES_COUNT; i++) {
		const groupMembers = faker.helpers.shuffle([..._groupMembers]);
		const groupAlphaMembers = groupMembers.pop()!;
		invariant(groupAlphaMembers, "groupAlphaMembers not found");

		const getGroupBravo = (): number[] => {
			const result = groupMembers.pop()!;
			invariant(result, "groupBravoMembers not found");
			if (groupAlphaMembers.some((m) => result.includes(m))) {
				return getGroupBravo();
			}

			return result;
		};
		const groupBravoMembers = getGroupBravo();

		let groupAlpha = 0;
		let groupBravo = 0;
		// -> create groups
		for (let i = 0; i < 2; i++) {
			const users = i === 0 ? [...groupAlphaMembers] : [...groupBravoMembers];
			const group = await SQGroupRepository.createGroup({
				status: "ACTIVE",
				userId: users.pop()!,
			});

			// -> add regular members of groups
			for (let i = 0; i < 3; i++) {
				await SQGroupRepository.addMember(group.id, {
					userId: users.pop()!,
				});
			}

			if (i === 0) {
				groupAlpha = group.id;
			} else {
				groupBravo = group.id;
			}
		}

		invariant(groupAlpha !== 0 && groupBravo !== 0, "groups not created");

		const match = await SQMatchRepository.create({
			alphaGroupId: groupAlpha,
			bravoGroupId: groupBravo,
			mapList: randomMapList(groupAlpha, groupBravo),
			memento: { users: {}, groups: {}, pools: [] },
		});

		// update match createdAt to the past
		await db
			.updateTable("GroupMatch")
			.set({ createdAt: dateToDatabaseTimestamp(matchDate) })
			.where("id", "=", match.id)
			.execute();

		if (faker.number.float(1) > 0.95) {
			// increment date by 1 day
			matchDate = new Date(matchDate.getTime() + 1000 * 60 * 60 * 24);
		}

		// -> report score
		const winners = faker.helpers.arrayElement([
			["ALPHA", "ALPHA", "ALPHA", "ALPHA"],
			["ALPHA", "ALPHA", "ALPHA", "BRAVO", "ALPHA"],
			["BRAVO", "BRAVO", "BRAVO", "BRAVO"],
			["ALPHA", "BRAVO", "BRAVO", "BRAVO", "BRAVO"],
			["ALPHA", "ALPHA", "ALPHA", "BRAVO", "BRAVO", "BRAVO", "BRAVO"],
			["BRAVO", "ALPHA", "BRAVO", "ALPHA", "BRAVO", "ALPHA", "BRAVO"],
			["ALPHA", "BRAVO", "BRAVO", "ALPHA", "ALPHA", "ALPHA"],
			["ALPHA", "BRAVO", "ALPHA", "BRAVO", "BRAVO", "BRAVO"],
		]) as ("ALPHA" | "BRAVO")[];

		const reporterUserId =
			faker.number.float(1) > 0.5 ? groupAlphaMembers[0] : groupBravoMembers[0];
		for (const [mapIndex, winner] of winners.entries()) {
			await SQMatchRepository.reportMapWinner({
				matchId: match.id,
				winnerId: winner === "ALPHA" ? groupAlpha : groupBravo,
				reportedByUserId: reporterUserId,
				reportedCount: mapIndex,
				isStaffReport: true,
			});
		}

		// -> add weapons for 90% of matches
		if (faker.number.float(1) > 0.9) continue;
		const finishedMatch = (await SQMatchRepository.findById(match.id))!;
		const users = [...groupAlphaMembers, ...groupBravoMembers];
		const mapsWithUsers = users.flatMap((u) =>
			finishedMatch.mapList.map((_, mapIndex) => ({ mapIndex, user: u })),
		);

		await ReportedWeaponRepository.createMany(
			mapsWithUsers.map((mu) => {
				const weapon = () => {
					if (faker.number.float(1) < 0.9) return defaultWeapons[mu.user];
					if (faker.number.float(1) > 0.5)
						return (
							mainWeaponIds.find((id) => id > defaultWeapons[mu.user]) ?? 0
						);

					const shuffled = faker.helpers.shuffle([...mainWeaponIds]);

					return shuffled[0];
				};

				return {
					groupMatchId: match.id,
					mapIndex: mu.mapIndex,
					userId: mu.user,
					weaponSplId: weapon(),
				};
			}),
		);
	}

	// skills are inserted with createdAt of the current time, but matches are
	// backdated above. Sync skill createdAt to the match date so the season
	// progression chart on the user seasons page has data spread across days.
	await db
		.updateTable("Skill")
		.set((eb) => ({
			createdAt: eb
				.selectFrom("GroupMatch")
				.select("GroupMatch.createdAt")
				.whereRef("GroupMatch.id", "=", "Skill.groupMatchId"),
		}))
		.where("groupMatchId", "is not", null)
		.execute();
}

async function friendCodes() {
	const allUsers = await userIdsInRandomOrder();

	for (const userId of allUsers) {
		const friendCode = "####-####-####".replace(/#+/g, (m) =>
			faker.string.numeric(m.length),
		);
		await UserRepository.insertFriendCode({
			userId,
			submitterUserId: userId,
			friendCode,
		});
	}
}

async function userReports() {
	// uneven spread over the trailing 12 months so the admin tab bar graph shows variety
	const monthsAgoDistribution = [
		0, 0, 0, 1, 2, 2, 2, 2, 5, 5, 7, 8, 10, 11, 11,
	];

	// attach a real SendouQ match to some reports so the admin tab's match links have data
	const someMatch = await db
		.selectFrom("GroupMatch")
		.select("id")
		.executeTakeFirst();

	await db
		.insertInto("UserReport")
		.values(
			monthsAgoDistribution.map((monthsAgo, i) => ({
				reportedUserId: NZAP_TEST_ID,
				reporterUserId: 10 + i,
				category: USER_REPORT_CATEGORIES[i % USER_REPORT_CATEGORIES.length],
				description: faker.lorem.sentences({ min: 1, max: 3 }),
				matchId: i % 3 === 0 ? (someMatch?.id ?? null) : null,
				createdAt: dateToDatabaseTimestamp(
					sub(new Date(), { months: monthsAgo, days: (i * 3) % 7, hours: i }),
				),
			})),
		)
		.execute();
}

async function lfgPosts() {
	const allUsers = (await userIdsInRandomOrder(true)).slice(0, 100);

	allUsers.unshift(NZAP_TEST_ID);

	for (const user of allUsers) {
		await LFGRepository.insertPost({
			authorId: user,
			text: faker.lorem.paragraphs({ min: 1, max: 6 }),
			timezone: faker.helpers.arrayElement(TIMEZONES),
			type: faker.helpers.arrayElement(["PLAYER_FOR_TEAM", "COACH_FOR_TEAM"]),
		});
	}

	await LFGRepository.insertPost({
		authorId: ADMIN_ID,
		text: faker.lorem.paragraphs({ min: 1, max: 6 }),
		timezone: "Europe/Helsinki",
		type: "TEAM_FOR_PLAYER",
		teamId: 1,
	});
}

async function scrimPosts() {
	const allUsers = await userIdsInRandomOrder(true);

	// Only schedule admin's scrim at least 1 hour in the future, others can be 'now'
	const date = (isAdmin = false) => {
		if (isAdmin) {
			const randomFuture = faker.date.between({
				from: add(new Date(), { hours: 1 }),
				to: add(new Date(), { days: 7 }),
			});
			randomFuture.setMinutes(0);
			randomFuture.setSeconds(0);
			randomFuture.setMilliseconds(0);
			return dateToDatabaseTimestamp(randomFuture);
		}
		const isNow = faker.number.float(1) > 0.5;
		if (isNow) {
			return databaseTimestampNow();
		}
		const randomFuture = faker.date.between({
			from: new Date(),
			to: add(new Date(), { days: 7 }),
		});
		randomFuture.setMinutes(0);
		randomFuture.setSeconds(0);
		randomFuture.setMilliseconds(0);
		return dateToDatabaseTimestamp(randomFuture);
	};

	const team = () => {
		const hasTeam = faker.number.float(1) > 0.5;

		if (!hasTeam) {
			return null;
		}

		return faker.helpers.rangeToNumber({ min: 5, max: 49 });
	};

	const divRange = () => {
		const hasDivRange = faker.number.float(1) > 0.2;

		if (!hasDivRange) {
			return null;
		}

		const maxDiv = faker.helpers.arrayElement([0, 1, 2, 3, 4, 5]);
		const minDiv = faker.helpers.arrayElement([6, 7, 8, 9, 10, 11]);

		return { maxDiv, minDiv };
	};

	const maps = (): "SZ" | "ALL" | "RANKED" | null => {
		return faker.helpers.arrayElement(["SZ", "ALL", "RANKED", null, null]);
	};

	const users = () => {
		const count = faker.helpers.arrayElement([4, 4, 4, 4, 4, 4, 5, 5, 5, 6]);

		const result: Array<{ userId: number; isOwner: DBBoolean }> = [];
		for (let i = 0; i < count; i++) {
			const user = allUsers.shift()!;

			result.push({
				userId: user,
				isOwner: toDBBoolean(i === 0),
			});
		}

		return result;
	};

	const usersWithOwner = (
		ownerUserId: number,
	): Array<{ userId: number; isOwner: DBBoolean }> => [
		...users().map((u) => ({ ...u, isOwner: 0 as const })),
		{ userId: ownerUserId, isOwner: 1 },
	];

	// Deterministic post 1: admin (Sendou) vs N-ZAP. The e2e map-by-map test
	// navigates straight to /scrims/1 and relies on this being an accepted
	// scrim with admin on the ALPHA side and N-ZAP on the BRAVO side.
	const adminVsNzapAt = date(true);
	const adminVsNzapPostId = await ScrimPostRepository.insert({
		startsAt: adminVsNzapAt,
		rangeEndsAt: null,
		isScheduledForFuture: true,
		teamId: null,
		text: null,
		visibility: null,
		users: usersWithOwner(ADMIN_ID),
		managedByAnyone: true,
		maps: null,
		mapsTournamentId: 4,
	});
	await ScrimPostRepository.insertRequest({
		scrimPostId: adminVsNzapPostId,
		users: usersWithOwner(NZAP_TEST_ID),
		message: null,
	});
	await ScrimPostRepository.acceptRequest(1);

	for (let i = 0; i < 19; i++) {
		const divs = divRange();
		const atTime = date();
		const hasRangeEnd = Math.random() > 0.5;
		await ScrimPostRepository.insert({
			startsAt: atTime,
			rangeEndsAt: hasRangeEnd
				? dateToDatabaseTimestamp(
						add(databaseTimestampToDate(atTime), {
							hours: faker.helpers.rangeToNumber({ min: 1, max: 3 }),
						}),
					)
				: null,
			isScheduledForFuture: true,
			maxDiv: divs?.maxDiv,
			minDiv: divs?.minDiv,
			teamId: team(),
			text:
				faker.number.float(1) > 0.5
					? faker.lorem.sentences({ min: 1, max: 5 })
					: null,
			visibility: null,
			users: users(),
			managedByAnyone: true,
			maps: maps(),
			mapsTournamentId: null,
		});
	}

	const adminPostAtTime = date(true); // admin's scrim is always at least 1 hour in the future
	const adminPostId = await ScrimPostRepository.insert({
		startsAt: adminPostAtTime,
		isScheduledForFuture: true,
		text:
			faker.number.float(1) > 0.5
				? faker.lorem.sentences({ min: 1, max: 5 })
				: null,
		visibility: null,
		users: usersWithOwner(ADMIN_ID),
		managedByAnyone: true,
		maps: maps(),
		mapsTournamentId: null,
	});
	await ScrimPostRepository.insertRequest({
		scrimPostId: adminPostId,
		users: users(),
		message:
			faker.number.float(1) > 0.5
				? faker.lorem.sentence({ min: 5, max: 15 })
				: null,
	});
	await ScrimPostRepository.insertRequest({
		scrimPostId: adminPostId,
		users: users(),
		message:
			faker.number.float(1) > 0.5
				? faker.lorem.sentence({ min: 5, max: 15 })
				: null,
	});
}

async function scrimPostRequests() {
	const allianceRogueMembers = await db
		.selectFrom(["TeamMember"])
		.select(["TeamMember.userId"])
		.where("TeamMember.teamId", "=", 1)
		.execute();

	// Post 1 is already accepted (admin-vs-nzap, seeded in scrimPosts()), so it
	// is excluded here.
	for (const id of [5, 12, 14, 19]) {
		await ScrimPostRepository.insertRequest({
			scrimPostId: id,
			users: allianceRogueMembers.map((member) => ({
				userId: member.userId,
				isOwner: member.userId === ADMIN_ID ? 1 : 0,
			})),
			teamId: 1,
			message:
				faker.number.float(1) > 0.5
					? faker.lorem.sentence({ min: 5, max: 15 })
					: null,
		});
	}
}

async function associations() {
	const allUsers = await userIdsInRandomOrder(true);

	for (let i = 0; i < 3; i++) {
		await AssociationRepository.insert({
			name: faker.company.name(),
			userId: i === 2 ? allUsers.shift()! : ADMIN_ID,
		});

		for (
			let j = 0;
			j < faker.helpers.arrayElement([4, 6, 8, 10, 12, 24, 32]);
			j++
		) {
			await AssociationRepository.addMember({
				associationId: i + 1,
				userId: i === 2 && j === 0 ? ADMIN_ID : allUsers.shift()!,
			});
		}
	}
}

async function notifications() {
	const values: Notification[] = [
		{
			type: "PLUS_SUGGESTION_ADDED",
			meta: { tier: 1 },
		},
		{
			type: "SEASON_STARTED",
			meta: { seasonNth: 1 },
		},
		{
			type: "TO_ADDED_TO_TEAM",
			meta: {
				adderUsername: "N-ZAP",
				teamName: "Chimera",
				tournamentId: 1,
				tournamentName: "PICNIC #2",
				tournamentTeamId: 1,
			},
		},
		{
			type: "TO_BRACKET_STARTED",
			meta: {
				tournamentId: 1,
				tournamentName: "PICNIC #2",
				bracketIdx: 0,
				bracketName: "Groups Stage",
			},
		},
		{
			type: "BADGE_ADDED",
			meta: { badgeName: "In The Zone 20-29", badgeId: 39 },
		},
		{
			type: "TAGGED_TO_ART",
			meta: {
				adderUsername: "N-ZAP",
				adderDiscordId: NZAP_TEST_DISCORD_ID,
				artId: 1, // does not exist
			},
		},
		{
			type: "SQ_ADDED_TO_GROUP",
			meta: { adderUsername: "N-ZAP" },
		},
		{
			type: "SQ_NEW_MATCH",
			meta: { matchId: 100 },
		},
		{
			type: "PLUS_VOTING_STARTED",
			meta: { seasonNth: 1 },
		},
		{
			type: "TO_CHECK_IN_OPENED",
			meta: { tournamentId: 1, tournamentName: "PICNIC #2" },
			pictureUrl: `${Config.staticAssetsUrl}/img/tournament-logos/pn.avif`,
		},
	];

	for (const [i, value] of values.entries()) {
		await NotificationRepository.insert(value, [
			{
				userId: ADMIN_ID,
				seen: i <= 7 ? 1 : 0,
			},
		]);
		await NotificationRepository.insert(value, [
			{
				userId: NZAP_TEST_ID,
				seen: i <= 7 ? 1 : 0,
			},
		]);
	}

	const createdAts = [
		sub(new Date(), { days: 10 }),
		sub(new Date(), { days: 8 }),
		sub(new Date(), { days: 5, hours: 2 }),
		sub(new Date(), { days: 4, minutes: 30 }),
		sub(new Date(), { days: 3, hours: 2 }),
		sub(new Date(), { days: 3, hours: 1, minutes: 10 }),
		sub(new Date(), { days: 2, hours: 5 }),
		sub(new Date(), { minutes: 10 }),
		sub(new Date(), { minutes: 5 }),
	];

	invariant(
		values.length - 1 === createdAts.length,
		"values and createdAts length mismatch",
	);

	for (let i = 0; i < values.length - 1; i++) {
		await db
			.updateTable("Notification")
			.set({ createdAt: dateToDatabaseTimestamp(createdAts[i]) })
			.where("id", "=", i + 1)
			.execute();
	}
}

async function organization() {
	await TournamentOrganizationRepository.create({
		ownerId: ADMIN_ID,
		name: "sendou.ink",
	});

	await TournamentOrganizationRepository.update({
		id: 1,
		name: "sendou.ink",
		description: "Sendou.ink official tournaments",
		socials: [
			"https://bsky.app/profile/sendou.ink",
			"https://twitch.tv/sendou",
		],
		members: [
			{
				userId: ADMIN_ID,
				role: "ADMIN",
				roleDisplayName: null,
			},
			{
				userId: NZAP_TEST_ID,
				role: "MEMBER",
				roleDisplayName: null,
			},
			{
				userId: ORG_ADMIN_TEST_ID,
				role: "ADMIN",
				roleDisplayName: null,
			},
		],
		series: [
			{
				name: "PICNIC",
				description: "PICNIC tournament series",
				showLeaderboard: false,
			},
		],
		badges: [],
	});

	await db
		.updateTable("TournamentOrganizationSeries")
		.set({ tierHistory: JSON.stringify([3, 4, 3]) })
		.where("organizationId", "=", 1)
		.where("name", "=", "PICNIC")
		.execute();
}

const SENDOU_FRIEND_IDS_IN_LOOKING_GROUPS = [150, 151, 152, 153];
const SENDOU_FRIEND_IDS_IN_TOURNAMENT_LFG = [100, 101];
const SENDOU_FRIEND_IDS_OTHER = [102, 103];

async function friendships(variation?: SeedVariation | null) {
	const insertFriendship = (idA: number, idB: number) =>
		db
			.insertInto("Friendship")
			.values({
				userOneId: Math.min(idA, idB),
				userTwoId: Math.max(idA, idB),
			})
			.execute();

	const allFriendIds = [
		...SENDOU_FRIEND_IDS_IN_LOOKING_GROUPS,
		...SENDOU_FRIEND_IDS_IN_TOURNAMENT_LFG,
		...SENDOU_FRIEND_IDS_OTHER,
	];

	for (const friendId of allFriendIds) {
		await insertFriendship(ADMIN_ID, friendId);
	}

	// friendships between some looking-group owners so their user cards show mutual friends with the
	// admin, while others (e.g. 153 and the additional members) intentionally have none
	await insertFriendship(150, 151);
	await insertFriendship(150, 152);
	await insertFriendship(151, 152);

	if (variation === "NO_SQ_GROUPS" || variation === "TEAM_MAP_PREFS") return;

	for (const friendId of SENDOU_FRIEND_IDS_IN_LOOKING_GROUPS) {
		const group = await SQGroupRepository.createGroup({
			status: "ACTIVE",
			userId: friendId,
		});

		const additionalMemberCount = faker.helpers.arrayElement([0, 1, 2]);
		const additionalMembers = [200, 201, 202, 203, 204, 205].slice(
			0,
			additionalMemberCount,
		);

		for (const memberId of additionalMembers) {
			await addGroupMember(group.id, memberId + (friendId - 150) * 10);
		}
	}
}

async function liveStreams() {
	const userIds = await userIdsInAscendingOrderById();

	// Add deterministic streams for E2E testing
	// Users 6 and 7 are in ITZ tournament team 102
	const deterministicStreams = [
		{ userId: 6, viewerCount: 150, twitch: "test_player_stream_1" },
		{ userId: 7, viewerCount: 75, twitch: "test_player_stream_2" },
		// Cast-only stream (user 100 is not in ITZ tournament teams)
		{ userId: 100, viewerCount: 500, twitch: "test_cast_stream" },
	];

	for (const stream of deterministicStreams) {
		await db
			.insertInto("LiveStream")
			.values({
				userId: stream.userId,
				viewerCount: stream.viewerCount,
				thumbnailUrl: "https://picsum.photos/320/180",
				twitch: stream.twitch,
			})
			.execute();
	}

	const streamingUserIds = [
		...userIds.slice(3, 20),
		...userIds.slice(40, 50),
		...userIds.slice(100, 110),
	].filter((id) => !deterministicStreams.some((s) => s.userId === id));

	const shuffledStreamers = faker.helpers.shuffle(streamingUserIds);
	const selectedStreamers = shuffledStreamers.slice(0, 17);

	for (const userId of selectedStreamers) {
		const viewerCount = faker.helpers.weightedArrayElement([
			{ value: faker.number.int({ min: 5, max: 30 }), weight: 5 },
			{ value: faker.number.int({ min: 31, max: 100 }), weight: 3 },
			{ value: faker.number.int({ min: 101, max: 500 }), weight: 2 },
			{ value: faker.number.int({ min: 501, max: 2000 }), weight: 1 },
		]);

		const thumbnailUrl = faker.image.urlPicsumPhotos({
			width: 320,
			height: 180,
		});

		const twitch = `fake_${nanoid()}`.toLowerCase();
		await db
			.insertInto("LiveStream")
			.values({ userId, viewerCount, thumbnailUrl, twitch })
			.execute();
	}
}

async function splatoonRotations() {
	const nowUnix = Math.floor(Date.now() / 1000);
	const TWO_HOURS = 2 * 60 * 60;

	const currentStart = nowUnix - (nowUnix % TWO_HOURS);

	const slotStart = (slot: number) => currentStart + slot * TWO_HOURS;
	const slotEnd = (slot: number) => slotStart(slot) + TWO_HOURS;

	// based on real splatoon3.ink data with realistic stage/mode combinations
	const rotationData = [
		{ type: "SERIES", mode: "SZ", stageId1: 0, stageId2: 11 },
		{ type: "SERIES", mode: "TC", stageId1: 1, stageId2: 24 },
		{ type: "SERIES", mode: "RM", stageId1: 7, stageId2: 23 },
		{ type: "SERIES", mode: "CB", stageId1: 0, stageId2: 9 },
		{ type: "SERIES", mode: "SZ", stageId1: 13, stageId2: 21 },
		{ type: "SERIES", mode: "RM", stageId1: 3, stageId2: 17 },
		{ type: "SERIES", mode: "SZ", stageId1: 6, stageId2: 7 },
		{ type: "SERIES", mode: "TC", stageId1: 8, stageId2: 23 },
		{ type: "SERIES", mode: "CB", stageId1: 2, stageId2: 18 },
		{ type: "SERIES", mode: "RM", stageId1: 10, stageId2: 20 },
		{ type: "SERIES", mode: "SZ", stageId1: 12, stageId2: 11 },
		{ type: "SERIES", mode: "TC", stageId1: 4, stageId2: 17 },
		{ type: "OPEN", mode: "RM", stageId1: 14, stageId2: 23 },
		{ type: "OPEN", mode: "CB", stageId1: 10, stageId2: 11 },
		{ type: "OPEN", mode: "SZ", stageId1: 2, stageId2: 17 },
		{ type: "OPEN", mode: "TC", stageId1: 15, stageId2: 20 },
		{ type: "OPEN", mode: "RM", stageId1: 12, stageId2: 19 },
		{ type: "OPEN", mode: "TC", stageId1: 11, stageId2: 16 },
		{ type: "OPEN", mode: "CB", stageId1: 5, stageId2: 23 },
		{ type: "OPEN", mode: "RM", stageId1: 1, stageId2: 7 },
		{ type: "OPEN", mode: "SZ", stageId1: 3, stageId2: 9 },
		{ type: "OPEN", mode: "TC", stageId1: 17, stageId2: 18 },
		{ type: "OPEN", mode: "CB", stageId1: 4, stageId2: 13 },
		{ type: "OPEN", mode: "RM", stageId1: 15, stageId2: 22 },
		{ type: "X", mode: "CB", stageId1: 13, stageId2: 7 },
		{ type: "X", mode: "RM", stageId1: 4, stageId2: 20 },
		{ type: "X", mode: "TC", stageId1: 10, stageId2: 19 },
		{ type: "X", mode: "SZ", stageId1: 1, stageId2: 14 },
		{ type: "X", mode: "CB", stageId1: 4, stageId2: 22 },
		{ type: "X", mode: "SZ", stageId1: 15, stageId2: 19 },
		{ type: "X", mode: "RM", stageId1: 18, stageId2: 24 },
		{ type: "X", mode: "CB", stageId1: 17, stageId2: 14 },
		{ type: "X", mode: "TC", stageId1: 16, stageId2: 20 },
		{ type: "X", mode: "SZ", stageId1: 0, stageId2: 23 },
		{ type: "X", mode: "RM", stageId1: 3, stageId2: 6 },
		{ type: "X", mode: "CB", stageId1: 9, stageId2: 21 },
	] as const;

	const ROTATIONS_PER_TYPE = 12;

	for (let i = 0; i < rotationData.length; i++) {
		const slot = i % ROTATIONS_PER_TYPE;
		const rotation = rotationData[i];

		await db
			.insertInto("SplatoonRotation")
			.values({
				...rotation,
				startsAt: slotStart(slot),
				endsAt: slotEnd(slot),
			})
			.execute();
	}
}

const addGroupMember = (groupId: number, userId: number) =>
	db
		.insertInto("GroupMember")
		.values({ groupId, userId, role: "REGULAR" })
		.execute();

/**
 * Ids of these rows are seeded explicitly so that tests can rely on them, which
 * the query builder disallows for always generated columns.
 */
function insertTournamentWithId(values: {
	id: number;
	mapPickingStyle: TournamentMapPickingStyle;
	settings: string;
	isFinalized?: DBBoolean;
}) {
	return sql`
		insert into "Tournament" ("id", "mapPickingStyle", "settings", "isFinalized")
		values (${values.id}, ${values.mapPickingStyle}, ${values.settings}, ${values.isFinalized ?? 0})
	`.execute(db);
}

function insertCalendarEventWithId(values: {
	id: number;
	name: string;
	description: string;
	discordInviteCode: string;
	bracketUrl: string;
	authorId: number | null;
	tournamentId?: number | null;
	organizationId?: number | null;
	avatarImgId?: number | null;
	tags?: string | null;
}) {
	return sql`
		insert into "CalendarEvent" ("id", "name", "description", "discordInviteCode", "bracketUrl", "authorId", "tournamentId", "organizationId", "avatarImgId", "tags")
		values (${values.id}, ${values.name}, ${values.description}, ${values.discordInviteCode}, ${values.bracketUrl}, ${values.authorId}, ${values.tournamentId ?? null}, ${values.organizationId ?? null}, ${values.avatarImgId ?? null}, ${values.tags ?? null})
	`.execute(db);
}

function insertTournamentTeamWithId(values: {
	id: number;
	name: string;
	createdAt: number;
	tournamentId: number;
	inviteCode: string;
	seed: number;
}) {
	return sql`
		insert into "TournamentTeam" ("id", "name", "createdAt", "tournamentId", "inviteCode", "seed")
		values (${values.id}, ${values.name}, ${values.createdAt}, ${values.tournamentId}, ${values.inviteCode}, ${values.seed})
	`.execute(db);
}
