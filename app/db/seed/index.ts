import { faker } from "@faker-js/faker";
import { add, sub } from "date-fns";
import { nanoid } from "nanoid";
import * as R from "remeda";
import { db, sql } from "~/db/sql";
import { ADMIN_DISCORD_ID, ADMIN_ID } from "~/features/admin/admin-constants";
import type { SeedVariation } from "~/features/api-private/routes/seed";
import * as AssociationRepository from "~/features/associations/AssociationRepository.server";
import * as BuildRepository from "~/features/builds/BuildRepository.server";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import { tags } from "~/features/calendar/calendar-constants";
import * as LFGRepository from "~/features/lfg/LFGRepository.server";
import { TIMEZONES } from "~/features/lfg/lfg-constants";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
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
import { SendouQ } from "~/features/sendouq/core/SendouQ.server";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import { calculateMatchSkills } from "~/features/sendouq-match/core/skills.server";
import {
	summarizeMaps,
	summarizePlayerResults,
} from "~/features/sendouq-match/core/summarizer.server";
import { winnersArrayToWinner } from "~/features/sendouq-match/q-match-utils";
import { addMapResults } from "~/features/sendouq-match/queries/addMapResults.server";
import { addPlayerResults } from "~/features/sendouq-match/queries/addPlayerResults.server";
import { addReportedWeapons } from "~/features/sendouq-match/queries/addReportedWeapons.server";
import { addSkills } from "~/features/sendouq-match/queries/addSkills.server";
import { reportScore } from "~/features/sendouq-match/queries/reportScore.server";
import { setGroupAsInactive } from "~/features/sendouq-match/queries/setGroupAsInactive.server";
import * as SQMatchRepository from "~/features/sendouq-match/SQMatchRepository.server";
import { BANNED_MAPS } from "~/features/sendouq-settings/banned-maps";
import * as QSettingsRepository from "~/features/sendouq-settings/QSettingsRepository.server";
import { AMOUNT_OF_MAPS_IN_POOL_PER_MODE } from "~/features/sendouq-settings/q-settings-constants";
import { TOURNAMENT } from "~/features/tournament/tournament-constants";
import { clearAllTournamentDataCache } from "~/features/tournament-bracket/core/Tournament.server";
import * as TournamentOrganizationRepository from "~/features/tournament-organization/TournamentOrganizationRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import * as VodRepository from "~/features/vods/VodRepository.server";
import {
	secondsToHoursMinutesSecondString,
	youtubeIdToYoutubeUrl,
} from "~/features/vods/vods-utils";
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
import { mainWeaponIds } from "~/modules/in-game-lists/weapon-ids";
import type { TournamentMapListMap } from "~/modules/tournament-map-list-generator/types";
import { nullFilledArray } from "~/utils/arrays";
import {
	databaseTimestampNow,
	databaseTimestampToDate,
	dateToDatabaseTimestamp,
} from "~/utils/dates";
import { shortNanoid } from "~/utils/id";
import invariant from "~/utils/invariant";
import { mySlugify } from "~/utils/urls";
import {
	getArtFilename,
	SEED_ART_URLS,
	SEED_TEAM_IMAGES,
	SEED_TOURNAMENT_IMAGES,
} from "../../../scripts/seed-art-urls";
import type { QWeaponPool, Tables, UserMapModePreferences } from "../tables";
import {
	ADMIN_TEST_AVATAR,
	AMOUNT_OF_CALENDAR_EVENTS,
	NZAP_TEST_AVATAR,
	NZAP_TEST_DISCORD_ID,
	NZAP_TEST_ID,
	ORG_ADMIN_TEST_ID,
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
	fixAdminId,
	makeArtists,
	adminUserWeaponPool,
	adminUserWidgets,
	userProfiles,
	userMapModePreferences,
	userQWeaponPool,
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
	tournamentSubs,
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
	variation === "NO_SQ_GROUPS" ? undefined : groups,
	friendCodes,
	lfgPosts,
	variation === "NO_SCRIMS" ? undefined : scrimPosts,
	variation === "NO_SCRIMS" ? undefined : scrimPostRequests,
	associations,
	notifications,
	liveStreams,
];

export async function seed(variation?: SeedVariation | null) {
	wipeDB();

	for (const seedFunc of basicSeeds(variation)) {
		if (!seedFunc) continue;

		faker.seed(5800);

		await seedFunc();
	}

	clearAllTournamentDataCache();
}

function wipeDB() {
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
		"User",
		"PlusSuggestion",
		"PlusVote",
		"TournamentBadgeOwner",
		"BadgeManager",
		"TournamentOrganization",
		"SeedingSkill",
		"LiveStream",
	];

	for (const table of tablesToDelete) {
		if (table === "Tournament") {
			// foreign key constraint reasons
			sql
				.prepare("delete from Tournament where parentTournamentId is not null")
				.run();
		}
		sql.prepare(`delete from "${table}"`).run();
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

function fixAdminId() {
	sql.prepare(`delete from user where id = ${ADMIN_ID}`).run();
	// make admin same ID as prod for easy switching
	sql.prepare(`update "User" set "id" = ${ADMIN_ID} where id = 1`).run();
}

function makeAdminPatron() {
	sql
		.prepare(
			`update "User" set "patronTier" = 2, "patronSince" = 1674663454 where id = 1`,
		)
		.run();
}

function makeAdminVideoAdder() {
	sql.prepare(`update "User" set "isVideoAdder" = 1 where id = 1`).run();
}

function makeAdminTournamentOrganizer() {
	sql
		.prepare(`update "User" set "isTournamentOrganizer" = 1 where id = 1`)
		.run();
}

function makeArtists() {
	sql
		.prepare(
			`update "User" set "isArtist" = 1 where id in (${ADMIN_ID}, ${NZAP_TEST_ID})`,
		)
		.run();
}

function adminUserWeaponPool() {
	for (const [i, weaponSplId] of [200, 1100, 2000, 4000].entries()) {
		sql
			.prepare(
				`
      insert into "UserWeapon" ("userId", "weaponSplId", "order")
        values ($userId, $weaponSplId, $order)
    `,
			)
			.run({ userId: ADMIN_ID, weaponSplId, order: i + 1 });
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
		sql
			.prepare(
				`
        UPDATE "User" SET 
          country = $country,
          customUrl = $customUrl,
          motionSens = $motionSens,
          stickSens = $stickSens,
          inGameName = $inGameName
        WHERE id = $userId`,
			)
			.run(args);
	}

	for (let id = 2; id < 500; id++) {
		if (id === ADMIN_ID || id === NZAP_TEST_ID) continue;
		if (faker.number.float(1) < 0.25) continue; // 75% have bio

		sql
			.prepare(
				`UPDATE "User" SET bio = $bio, country = $country WHERE id = $id`,
			)
			.run({
				id,
				bio: faker.lorem.paragraphs(
					faker.helpers.arrayElement([1, 1, 1, 2, 3, 4]),
					"\n\n",
				),
				country:
					faker.number.float(1) > 0.5 ? faker.location.countryCode() : null,
			});
	}

	for (let id = 2; id < 500; id++) {
		if (id === ADMIN_ID || id === NZAP_TEST_ID) continue;
		if (faker.number.float(1) < 0.15) continue; // 85% have weapons

		const weapons = faker.helpers.shuffle(mainWeaponIds);

		for (let j = 0; j < faker.helpers.arrayElement([1, 2, 3, 4, 5]); j++) {
			sql
				.prepare(
					/* sql */ `insert into "UserWeapon" (
          "userId",
          "weaponSplId",
          "order",
          "isFavorite"
        ) values (
          @userId,
          @weaponSplId,
          @order,
          @isFavorite
        )`,
				)
				.run({
					userId: id,
					weaponSplId: weapons.pop()!,
					order: j + 1,
					isFavorite: faker.number.float(1) > 0.8 ? 1 : 0,
				});
		}
	}

	for (let id = 1; id < 500; id++) {
		const defaultLanguages = faker.number.float(1) > 0.1 ? ["en"] : [];
		if (faker.number.float(1) > 0.9) defaultLanguages.push("es");
		if (faker.number.float(1) > 0.9) defaultLanguages.push("fr");
		if (faker.number.float(1) > 0.9) defaultLanguages.push("de");
		if (faker.number.float(1) > 0.9) defaultLanguages.push("it");
		if (faker.number.float(1) > 0.9) defaultLanguages.push("ja");

		await QSettingsRepository.updateVoiceChat({
			languages: defaultLanguages,
			userId: id,
			vc:
				faker.number.float(1) > 0.2
					? "YES"
					: faker.helpers.arrayElement(["YES", "NO", "LISTEN_ONLY"]),
		});
	}
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

async function userQWeaponPool() {
	for (let id = 1; id < 500; id++) {
		if (id === 2) continue; // no weapons for N-ZAP
		if (faker.number.float(1) < 0.2) continue; // 80% have weapons

		const weapons = faker.helpers
			.shuffle(mainWeaponIds)
			.slice(0, faker.helpers.arrayElement([1, 2, 3, 4]));

		const weaponPool: Array<QWeaponPool> = weapons.map((weaponSplId) => ({
			weaponSplId,
			isFavorite: faker.number.float(1) > 0.7 ? 1 : 0,
		}));

		await db
			.updateTable("User")
			.set({ qWeaponPool: JSON.stringify(weaponPool) })
			.where("User.id", "=", id)
			.execute();
	}
}

function seedingSkills() {
	const users = sql.prepare('SELECT id FROM "User" LIMIT 500').all() as {
		id: number;
	}[];

	for (const { id: userId } of users) {
		if (faker.number.float() < 0.7) {
			const mu = faker.number.float({ min: 22, max: 45 });
			const sigma = faker.number.float({ min: 4, max: 8 });
			const ordinal = mu - 3 * sigma;

			sql
				.prepare(
					`INSERT INTO "SeedingSkill" ("userId", "type", "mu", "sigma", "ordinal") VALUES (?, 'RANKED', ?, ?, ?)`,
				)
				.run(userId, mu, sigma, ordinal);
		}

		if (faker.number.float() < 0.5) {
			const mu = faker.number.float({ min: 22, max: 42 });
			const sigma = faker.number.float({ min: 4, max: 8 });
			const ordinal = mu - 3 * sigma;

			sql
				.prepare(
					`INSERT INTO "SeedingSkill" ("userId", "type", "mu", "sigma", "ordinal") VALUES (?, 'UNRANKED', ?, ?, ?)`,
				)
				.run(userId, mu, sigma, ordinal);
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
			validAfter: dateToDatabaseTimestamp(fiveMinutesAgo),
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
			validAfter: dateToDatabaseTimestamp(fiveMinutesAgo),
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

function syncPlusTiers() {
	sql
		.prepare(
			/* sql */ `
    insert into "PlusTier" ("userId", "tier") select "userId", "tier" from "FreshPlusTier" where "tier" is not null;
  `,
		)
		.run();
}

function getAvailableBadgeIds() {
	return faker.helpers.shuffle(
		(sql.prepare(`select "id" from "Badge"`).all() as any[]).map((b) => b.id),
	);
}

function badgesToUsers() {
	const availableBadgeIds = getAvailableBadgeIds();

	let userIds = (
		sql
			.prepare(
				`select "id" from "User" where id != ${NZAP_TEST_ID} and id != ${ADMIN_ID}`,
			)
			.all() as any[]
	).map((u) => u.id) as number[];

	const insertTournamentBadgeOwnerStm = sql.prepare(
		`insert into "TournamentBadgeOwner" ("badgeId", "userId") values ($id, $userId)`,
	);

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

			insertTournamentBadgeOwnerStm.run({ id, userId: userToGetABadge });

			userIds.push(userToGetABadge);
		}
	}

	for (const badgeId of nullFilledArray(20).map((_, i) => i + 1)) {
		insertTournamentBadgeOwnerStm.run({ id: badgeId, userId: ADMIN_ID });
	}

	for (const badgeId of [5, 6, 7]) {
		insertTournamentBadgeOwnerStm.run({ id: badgeId, userId: NZAP_TEST_ID });
	}
}

function badgeManagers() {
	// make N-ZAP user manager of several badges
	for (let id = 1; id <= 10; id++) {
		sql
			.prepare(
				`insert into "BadgeManager" ("badgeId", "userId") values ($id, $userId)`,
			)
			.run({ id, userId: NZAP_TEST_ID });
	}
}

function patrons() {
	const userIds = (
		sql
			.prepare(`select "id" from "User" order by random() limit 50`)
			.all() as any[]
	)
		.map((u) => u.id)
		.filter(
			(id) =>
				id !== NZAP_TEST_ID && id !== ADMIN_ID && id !== ORG_ADMIN_TEST_ID,
		) as number[];

	const givePatronStm = sql.prepare(
		`update user set "patronTier" = $patronTier, "patronSince" = $patronSince where id = $id`,
	);
	for (const id of userIds) {
		givePatronStm.run({
			id,
			patronSince: dateToDatabaseTimestamp(faker.date.past()),
			patronTier: faker.helpers.arrayElement([1, 1, 2, 2, 2, 3, 3, 4]),
		});
	}

	givePatronStm.run({
		id: ADMIN_ID,
		patronSince: dateToDatabaseTimestamp(faker.date.past()),
		patronTier: 2,
	});

	// Give ORG_ADMIN_TEST_ID API access without patron status
	// so they don't get TOURNAMENT_ADDER role
	sql
		.prepare(`update user set "isApiAccesser" = 1 where id = ?`)
		.run(ORG_ADMIN_TEST_ID);
}

function userIdsInRandomOrder(specialLast = false) {
	const rows = (
		sql.prepare(`select "id" from "User" order by random()`).all() as any[]
	).map((u) => u.id) as number[];

	if (!specialLast) return rows;

	return [
		...rows.filter((id) => id !== ADMIN_ID && id !== NZAP_TEST_ID),
		ADMIN_ID,
		NZAP_TEST_ID,
	];
}

function userIdsInAscendingOrderById() {
	const ids = (
		sql.prepare(`select "id" from "User" order by id asc`).all() as any[]
	).map((u) => u.id) as number[];

	return [ADMIN_ID, ...ids.filter((id) => id !== ADMIN_ID)];
}

function calendarEvents() {
	const userIds = userIdsInRandomOrder();

	for (let id = 1; id <= AMOUNT_OF_CALENDAR_EVENTS; id++) {
		const shuffledTags = faker.helpers.shuffle(Object.keys(tags));

		sql
			.prepare(
				`
      insert into "CalendarEvent" (
        "id",
        "name",
        "description",
        "discordInviteCode",
        "bracketUrl",
        "authorId",
        "tags"
      ) values (
        $id,
        $name,
        $description,
        $discordInviteCode,
        $bracketUrl,
        $authorId,
        $tags
      )
      `,
			)
			.run({
				id,
				name: `${R.capitalize(faker.word.adjective())} ${R.capitalize(
					faker.word.noun(),
				)}`,
				description: faker.lorem.paragraph(),
				discordInviteCode: faker.lorem.word(),
				bracketUrl: faker.internet.url(),
				authorId: id === 1 ? NZAP_TEST_ID : (userIds.pop() ?? null),
				tags:
					faker.number.float(1) > 0.2
						? shuffledTags
								.slice(
									0,
									faker.helpers.arrayElement([
										1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 4, 5, 6,
									]),
								)
								.join(",")
						: null,
			});

		const twoDayEvent = faker.number.float(1) > 0.9;
		const startTime =
			id % 2 === 0
				? faker.date.soon({ days: 42 })
				: faker.date.recent({ days: 42 });
		startTime.setMinutes(0, 0, 0);

		sql
			.prepare(
				`
        insert into "CalendarEventDate" (
          "eventId",
          "startTime"
        ) values (
          $eventId,
          $startTime
        )
      `,
			)
			.run({
				eventId: id,
				startTime: dateToDatabaseTimestamp(startTime),
			});

		if (twoDayEvent) {
			startTime.setDate(startTime.getDate() + 1);

			sql
				.prepare(
					`
          insert into "CalendarEventDate" (
            "eventId",
            "startTime"
          ) values (
            $eventId,
            $startTime
          )
        `,
				)
				.run({
					eventId: id,
					startTime: dateToDatabaseTimestamp(startTime),
				});
		}
	}
}

const addCalendarEventBadgeStm = sql.prepare(
	/*sql */ `insert into "CalendarEventBadge" 
          ("eventId", "badgeId") 
          values ($eventId, $badgeId)`,
);

function calendarEventBadges() {
	for (let eventId = 1; eventId <= AMOUNT_OF_CALENDAR_EVENTS; eventId++) {
		if (faker.number.float(1) > 0.25) continue;

		const availableBadgeIds = getAvailableBadgeIds();

		for (
			let i = 0;
			i < faker.helpers.arrayElement([1, 1, 1, 1, 2, 2, 3]);
			i++
		) {
			addCalendarEventBadgeStm.run({
				eventId,
				badgeId: availableBadgeIds.pop(),
			});
		}
	}
}

async function calendarEventResults() {
	let userIds = userIdsInRandomOrder();
	const eventIdsOfPast = new Set<number>(
		(
			sql
				.prepare(
					`select "CalendarEvent"."id" 
          from "CalendarEvent" 
          join "CalendarEventDate" on "CalendarEventDate"."eventId" = "CalendarEvent"."id"
          where "CalendarEventDate"."startTime" < $startTime`,
				)
				.all({ startTime: dateToDatabaseTimestamp(new Date()) }) as any[]
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
					teamName: R.capitalize(faker.word.noun()),
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

		userIds = userIdsInRandomOrder();
	}
}

const TO_TOOLS_CALENDAR_EVENT_ID = 201;
function calendarEventWithToTools(
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

	sql
		.prepare(
			`
      insert into "Tournament" (
        "id",
        "mapPickingStyle",
        "settings"
      ) values (
        $id,
        $mapPickingStyle,
        $settings
      ) returning *
      `,
		)
		.run({
			id: tournamentId,
			settings: JSON.stringify(settings),
			mapPickingStyle:
				event === "SOS" || event === "LUTI"
					? "TO"
					: event === "ITZ"
						? "AUTO_SZ"
						: "AUTO_ALL",
		});

	sql
		.prepare(
			`
      insert into "CalendarEvent" (
        "id",
        "name",
        "description",
        "discordInviteCode",
        "bracketUrl",
        "authorId",
        "tournamentId",
				"organizationId",
				"avatarImgId"
      ) values (
        $id,
        $name,
        $description,
        $discordInviteCode,
        $bracketUrl,
        $authorId,
        $tournamentId,
				$organizationId,
				$avatarImgId
      )
      `,
		)
		.run({
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

	sql
		.prepare(
			`
        insert into "CalendarEventDate" (
          "eventId",
          "startTime"
        ) values (
          $eventId,
          $startTime
        )
      `,
		)
		.run({
			eventId,
			startTime: dateToDatabaseTimestamp(
				registrationOpen
					? halfAnHourFromNow
					: new Date(Date.now() - 1000 * 60 * 60),
			),
		});

	for (const badgeId of badges) {
		addCalendarEventBadgeStm.run({
			eventId,
			badgeId,
		});
	}
}

const tiebreakerPicks = new MapPool([
	{ mode: "SZ", stageId: 1 },
	{ mode: "TC", stageId: 2 },
	{ mode: "RM", stageId: 3 },
	{ mode: "CB", stageId: 4 },
]);
function calendarEventWithToToolsTieBreakerMapPool() {
	for (const tieBreakerCalendarEventId of [
		TO_TOOLS_CALENDAR_EVENT_ID, // PICNIC
		TO_TOOLS_CALENDAR_EVENT_ID + 2, // Paddling Pool
		TO_TOOLS_CALENDAR_EVENT_ID + 4, // The Depths
	]) {
		for (const { mode, stageId } of tiebreakerPicks.stageModePairs) {
			sql
				.prepare(
					`
          insert into "MapPoolMap" (
            "tieBreakerCalendarEventId",
            "stageId",
            "mode"
          ) values (
            $tieBreakerCalendarEventId,
            $stageId,
            $mode
          )
        `,
				)
				.run({
					tieBreakerCalendarEventId,
					stageId,
					mode,
				});
		}
	}
}

function calendarEventWithToToolsToSetMapPool() {
	const stages = [
		...SENDOUQ_DEFAULT_MAPS.SZ.map((stageId) => ({ mode: "SZ", stageId })),
		...SENDOUQ_DEFAULT_MAPS.TC.map((stageId) => ({ mode: "TC", stageId })),
		...SENDOUQ_DEFAULT_MAPS.RM.map((stageId) => ({ mode: "RM", stageId })),
		...SENDOUQ_DEFAULT_MAPS.CB.map((stageId) => ({ mode: "CB", stageId })),
	];

	for (const { mode, stageId } of stages) {
		sql
			.prepare(
				`
        insert into "MapPoolMap" (
          "calendarEventId",
          "stageId",
          "mode"
        ) values (
          $calendarEventId,
          $stageId,
          $mode
        )
      `,
			)
			.run({
				calendarEventId: TO_TOOLS_CALENDAR_EVENT_ID + 3,
				stageId,
				mode,
			});
	}
}

const validTournamentTeamName = () => {
	while (true) {
		const name = faker.music.songName();
		if (name.length <= TOURNAMENT.TEAM_NAME_MAX_LENGTH) return name;
	}
};

const availableStages: StageId[] = [1, 2, 3, 4, 6, 7, 8, 10, 11];
const availablePairs = rankedModesShort
	.flatMap((mode) =>
		availableStages.map((stageId) => ({ mode, stageId: stageId })),
	)
	.filter((pair) => !tiebreakerPicks.has(pair));
function calendarEventWithToToolsTeams(
	event: "PICNIC" | "ITZ" | "PP" | "SOS" | "DEPTHS" | "LUTI" = "PICNIC",
	isSmall = false,
) {
	const userIds = userIdsInAscendingOrderById();
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

		sql
			.prepare(
				`
      insert into "TournamentTeam" (
        "id",
        "name",
        "createdAt",
        "tournamentId",
        "inviteCode",
        "seed"
      ) values (
        $id,
        $name,
        $createdAt,
        $tournamentId,
        $inviteCode,
        $seed
      )
      `,
			)
			.run({
				id: teamId,
				name,
				createdAt: dateToDatabaseTimestamp(new Date()),
				tournamentId,
				inviteCode: shortNanoid(),
				seed: id,
			});

		// in PICNIC & PP Chimera is not checked in + in LUTI no check-ins at all
		if (teamId !== 1 && teamId !== 201 && event !== "LUTI") {
			sql
				.prepare(
					`
      insert into "TournamentTeamCheckIn" (
        "tournamentTeamId",
        "checkedInAt"
      ) values (
        $tournamentTeamId,
        $checkedInAt
      )
      `,
				)
				.run({
					tournamentTeamId: teamId,
					checkedInAt: dateToDatabaseTimestamp(new Date()),
				});
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

			sql
				.prepare(
					`
      insert into "TournamentTeamMember" (
        "tournamentTeamId",
        "userId",
        "isOwner",
        "createdAt"
      ) values (
        $tournamentTeamId,
        $userId,
        $isOwner,
        $createdAt
      )
      `,
				)
				.run({
					tournamentTeamId: id + teamIdAddition,
					userId,
					isOwner: i === 0 ? 1 : 0,
					createdAt: dateToDatabaseTimestamp(yesterday),
				});
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

				sql
					.prepare(
						`
        insert into "MapPoolMap" (
          "tournamentTeamId",
          "stageId",
          "mode"
        ) values (
          $tournamentTeamId,
          $stageId,
          $mode
        )
        `,
					)
					.run({
						tournamentTeamId: id + teamIdAddition,
						stageId: pair.stageId,
						mode: pair.mode,
					});

				if (pair.mode === "SZ") SZ++;
				if (pair.mode === "TC") TC++;
				if (pair.mode === "RM") RM++;
				if (pair.mode === "CB") CB++;
			}
		}
	}
}

function tournamentSubs() {
	for (let id = 100; id < 120; id++) {
		const includedWeaponIds: MainWeaponId[] = [];

		sql
			.prepare(
				/* sql */ `
      insert into "TournamentSub" (
        "userId",
        "tournamentId",
        "canVc",
        "bestWeapons",
        "okWeapons",
        "message",
        "visibility"
      ) values (
        @userId,
        @tournamentId,
        @canVc,
        @bestWeapons,
        @okWeapons,
        @message,
        @visibility
      )
    `,
			)
			.run({
				userId: id,
				tournamentId: 1,
				canVc: Number(faker.number.float(1) > 0.5),
				bestWeapons: nullFilledArray(
					faker.helpers.arrayElement([1, 1, 1, 2, 2, 3, 4, 5]),
				)
					// biome-ignore lint/suspicious/useIterableCallbackReturn: Biome 2.3.1 upgrade
					.map(() => {
						while (true) {
							const weaponId = R.sample(mainWeaponIds, 1)[0]!;
							if (!includedWeaponIds.includes(weaponId)) {
								includedWeaponIds.push(weaponId);
								return weaponId;
							}
						}
					})
					.join(","),
				okWeapons:
					faker.number.float(1) > 0.5
						? null
						: nullFilledArray(
								faker.helpers.arrayElement([1, 1, 1, 2, 2, 3, 4, 5]),
							)
								// biome-ignore lint/suspicious/useIterableCallbackReturn: Biome 2.3.1 upgrade
								.map(() => {
									while (true) {
										const weaponId = R.sample(mainWeaponIds, 1)[0]!;
										if (!includedWeaponIds.includes(weaponId)) {
											includedWeaponIds.push(weaponId);
											return weaponId;
										}
									}
								})
								.join(","),
				message: faker.number.float(1) > 0.5 ? null : faker.lorem.paragraph(),
				visibility: id < 105 ? "+1" : id < 110 ? "+2" : id < 115 ? "+2" : "ALL",
			});
	}

	return null;
}

const randomAbility = (legalTypes: AbilityType[]) => {
	const randomOrderAbilities = faker.helpers.shuffle([...abilities]);

	return randomOrderAbilities.find((a) => legalTypes.includes(a.type))!.name;
};

const adminWeaponPool = mainWeaponIds.filter(() => faker.number.float(1) > 0.8);
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
			private: 0,
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
		...userIdsInRandomOrder().filter(
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
			.shuffle(mainWeaponIds.slice())
			.filter((id) => id !== SPLATTERSHOT_ID);

		const ownerId = users.pop()!;

		await BuildRepository.create({
			private: 0,
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

const detailedTeam = (seedVariation?: SeedVariation | null) => () => {
	sql
		.prepare(
			/* sql */ `
      insert into "AllTeam" ("name", "customUrl", "inviteCode", "bio", "avatarImgId")
       values (
          'Alliance Rogue',
          'alliance-rogue',
          '${shortNanoid()}',
          '${faker.lorem.paragraph()}',
          ${getTeamImageId(1)}
       )
  `,
		)
		.run();

	const userIds = userIdsInRandomOrder(true).filter(
		(id) => id !== NZAP_TEST_ID,
	);
	if (seedVariation === "NZAP_IN_TEAM") {
		userIds.unshift(NZAP_TEST_ID);
	}
	for (let i = 0; i < 5; i++) {
		const userId = i === 0 ? ADMIN_ID : userIds.shift()!;

		sql
			.prepare(
				/*sql*/ `
      insert into "AllTeamMember" ("teamId", "userId", "role", "isOwner", "leftAt")
        values (
          1,
          ${userId},
          ${i === 0 ? "'CAPTAIN'" : "'FRONTLINE'"},
          ${i === 0 ? 1 : 0},
          ${i < 4 ? "null" : "1672587342"}
        )
    `,
			)
			.run();
	}
};

function otherTeams() {
	const usersInTeam = (
		sql
			.prepare(
				/*sql */ `select
    "userId"
    from "AllTeamMember"
    `,
			)
			.all() as any[]
	).map((row) => row.userId);

	const userIds = userIdsInRandomOrder().filter(
		(u) => !usersInTeam.includes(u) && u !== NZAP_TEST_ID,
	);

	for (let i = 3; i < 50; i++) {
		const teamName =
			i === 3
				? "Team Olive"
				: `${R.capitalize(faker.word.adjective())} ${R.capitalize(
						faker.word.noun(),
					)}`;
		const teamCustomUrl = mySlugify(teamName);

		sql
			.prepare(
				/* sql */ `
      insert into "AllTeam" ("id", "name", "customUrl", "inviteCode", "bio")
       values (
          @id,
          @name,
          @customUrl,
          @inviteCode,
          @bio
       )
    `,
			)
			.run({
				id: i,
				name: teamName,
				customUrl: teamCustomUrl,
				inviteCode: shortNanoid(),
				bio: faker.lorem.paragraph(),
			});

		const numMembers = faker.helpers.arrayElement([
			1, 2, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 7, 7, 8,
		]);
		for (let j = 0; j < numMembers; j++) {
			const userId = userIds.shift()!;

			sql
				.prepare(
					/*sql*/ `
        insert into "AllTeamMember" ("teamId", "userId", "role", "isOwner")
          values (
            ${i},
            ${userId},
            ${j === 0 ? "'CAPTAIN'" : "'FRONTLINE'"},
            ${j === 0 ? 1 : 0}
          )
      `,
				)
				.run();
		}
	}
}

async function realVideo() {
	for (let i = 0; i < 5; i++) {
		await VodRepository.insert({
			type: "TOURNAMENT",
			youtubeUrl: youtubeIdToYoutubeUrl("M4aV-BQWlVg"),
			date: { day: 2, month: 2, year: 2023 },
			submitterUserId: ADMIN_ID,
			title: "LUTI Division X Tournament - ABBF (THRONE) vs. Ascension",
			pov: {
				type: "USER",
				userId: faker.helpers.arrayElement(userIdsInRandomOrder()),
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
const addPlayerStm = sql.prepare(/* sql */ `
  insert into "SplatoonPlayer" ("splId", "userId")
  values (@splId, @userId)
  on conflict ("splId") do nothing
`);

const addPlacementStm = sql.prepare(/* sql */ `
  insert into "XRankPlacement" (
    "weaponSplId",
    "name",
    "nameDiscriminator",
    "power",
    "rank",
    "title",
    "badges",
    "bannerSplId",
    "playerId",
    "month",
    "year",
    "region",
    "mode"
  )
  values (
    @weaponSplId,
    @name,
    @nameDiscriminator,
    @power,
    @rank,
    @title,
    @badges,
    @bannerSplId,
    (select "id" from "SplatoonPlayer" where "splId" = @playerSplId),
    @month,
    @year,
    @region,
    @mode
  )
`);

function xRankPlacements() {
	sql.transaction(() => {
		for (const [i, placement] of placements.entries()) {
			const userId = () => {
				// admin
				if (placement.playerSplId === "qx6imlx72tfeqrhqfnmm") return ADMIN_ID;
				// user in top 500 who is not plus server member
				if (i === 0) return 500;

				return null;
			};
			addPlayerStm.run({
				splId: placement.playerSplId,
				userId: userId(),
			});
			addPlacementStm.run(placement);
		}
	})();
}

const addArtStm = sql.prepare(/* sql */ `
  insert into "Art" (
    "imgId",
    "authorId",
    "isShowcase",
    "description"
  )
  values (
    @imgId,
    @authorId,
    @isShowcase,
    @description
  ) returning *
`);
const addUnvalidatedUserSubmittedImageStm = sql.prepare(/* sql */ `
  insert into "UnvalidatedUserSubmittedImage" (
    "validatedAt",
    "url",
    "submitterUserId"
  ) values (
    @validatedAt,
    @url,
    @submitterUserId
  ) returning *
`);

const teamAndTournamentImages = new Map<string, number>();

function insertTeamAndTournamentImages() {
	for (const { filename } of SEED_TEAM_IMAGES) {
		const result = addUnvalidatedUserSubmittedImageStm.get({
			validatedAt: dateToDatabaseTimestamp(new Date()),
			url: filename,
			submitterUserId: ADMIN_ID,
		}) as Tables["UserSubmittedImage"];
		teamAndTournamentImages.set(filename, result.id);
	}

	for (const { filename } of SEED_TOURNAMENT_IMAGES) {
		const result = addUnvalidatedUserSubmittedImageStm.get({
			validatedAt: dateToDatabaseTimestamp(new Date()),
			url: filename,
			submitterUserId: ADMIN_ID,
		}) as Tables["UserSubmittedImage"];
		teamAndTournamentImages.set(filename, result.id);
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
const addArtUserMetadataStm = sql.prepare(/* sql */ `
  insert into "ArtUserMetadata" (
    "artId",
    "userId"
  )
  values (
    @artId,
    @userId
  )
`);
const artImgFilenames = Array.from({ length: SEED_ART_URLS.length }, (_, i) =>
	getArtFilename(i),
);

function arts() {
	const artUsers = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
	const allUsers = userIdsInRandomOrder();
	const urls = [...artImgFilenames];

	for (const userId of artUsers) {
		for (let i = 0; i < faker.helpers.arrayElement([1, 2, 3, 3, 3, 4]); i++) {
			const url = urls.pop()!;
			if (!url) break;

			const addedArt = addArtStm.get({
				imgId: (
					addUnvalidatedUserSubmittedImageStm.get({
						validatedAt: dateToDatabaseTimestamp(new Date()),
						url,
						submitterUserId: userId,
					}) as Tables["UserSubmittedImage"]
				).id,
				authorId: userId,
				isShowcase: i === 0 ? 1 : 0,
				description:
					faker.number.float(1) > 0.5 ? faker.lorem.paragraph() : null,
			}) as Tables["Art"];

			if (i === 1) {
				for (
					let i = 0;
					i < faker.helpers.arrayElement([1, 1, 1, 1, 2, 4]);
					i++
				) {
					addArtUserMetadataStm.run({
						artId: addedArt.id,
						userId: i === 0 ? NZAP_TEST_ID : (allUsers.pop() ?? null),
					});
				}
			}
		}
	}
}

const updateCommissionStm = sql.prepare(/* sql */ `
  update "User"
  set
    "commissionsOpen" = @commissionsOpen,
    "commissionText" = @commissionText
  where id = @userId
`);
function commissionsOpen() {
	const allUsers = userIdsInRandomOrder();

	for (const userId of allUsers) {
		if (faker.number.float(1) > 0.5) {
			updateCommissionStm.run({
				commissionsOpen: 1,
				commissionText: faker.lorem.paragraph(),
				userId,
			});
		}
	}
}

const SENDOU_IN_FULL_GROUP = true;
async function groups() {
	const users = userIdsInAscendingOrderById()
		.slice(0, 100)
		.filter((id) => id !== ADMIN_ID && id !== NZAP_TEST_ID);
	users.push(NZAP_TEST_ID);

	for (let i = 0; i < 25; i++) {
		const group = await SQGroupRepository.createGroup({
			status: "ACTIVE",
			userId: users.pop()!,
		});

		const amountOfAdditionalMembers = () => {
			if (SENDOU_IN_FULL_GROUP) {
				if (i === 0) return 3;
				if (i === 1) return 3;
			}

			return i === 0 ? 2 : i % 4;
		};

		for (let j = 0; j < amountOfAdditionalMembers(); j++) {
			sql
				.prepare(
					/* sql */ `
        insert into "GroupMember" ("groupId", "userId", "role")
        values (@groupId, @userId, @role)
      `,
				)
				.run({
					groupId: group.id,
					userId: users.pop()!,
					role: "REGULAR",
				});
		}

		if (i === 0 && SENDOU_IN_FULL_GROUP) {
			users.push(ADMIN_ID);
		}
	}
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

const MATCHES_COUNT = 500;

const AMOUNT_OF_USERS_WITH_SKILLS = 100;

async function playedMatches() {
	const _groupMembers = (() => {
		return new Array(AMOUNT_OF_USERS_WITH_SKILLS).fill(null).map(() => {
			const users = faker.helpers.shuffle(
				userIdsInAscendingOrderById().slice(0, AMOUNT_OF_USERS_WITH_SKILLS),
			);

			return new Array(4).fill(null).map(() => users.pop()!);
		});
	})();
	const defaultWeapons = Object.fromEntries(
		userIdsInAscendingOrderById()
			.slice(0, AMOUNT_OF_USERS_WITH_SKILLS)
			.map((id) => {
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
		sql
			.prepare(
				/* sql */ `
      update "GroupMatch"
      set "createdAt" = @createdAt
      where "id" = @id
    `,
			)
			.run({
				createdAt: dateToDatabaseTimestamp(matchDate),
				id: match.id,
			});

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
		const winner = winnersArrayToWinner(winners);
		const finishedMatch = SendouQ.mapMatch(
			(await SQMatchRepository.findById(match.id))!,
		);

		const { newSkills, differences } = calculateMatchSkills({
			groupMatchId: match.id,
			winner: winner === "ALPHA" ? groupAlphaMembers : groupBravoMembers,
			loser: winner === "ALPHA" ? groupBravoMembers : groupAlphaMembers,
			loserGroupId: winner === "ALPHA" ? groupBravo : groupAlpha,
			winnerGroupId: winner === "ALPHA" ? groupAlpha : groupBravo,
		});

		const members = [
			...finishedMatch.groupAlpha.members.map((m) => ({
				...m,
				groupId: match.alphaGroupId,
			})),
			...finishedMatch.groupBravo.members.map((m) => ({
				...m,
				groupId: match.bravoGroupId,
			})),
		];
		sql.transaction(() => {
			reportScore({
				matchId: match.id,
				reportedByUserId:
					faker.number.float(1) > 0.5
						? groupAlphaMembers[0]
						: groupBravoMembers[0],
				winners,
			});
			addSkills({
				skills: newSkills,
				differences,
				groupMatchId: match.id,
				oldMatchMemento: { users: {}, groups: {}, pools: [] },
			});
			setGroupAsInactive(groupAlpha);
			setGroupAsInactive(groupBravo);
			addMapResults(summarizeMaps({ match: finishedMatch, members, winners }));
			addPlayerResults(
				summarizePlayerResults({ match: finishedMatch, members, winners }),
			);
		})();

		// -> add weapons for 90% of matches
		if (faker.number.float(1) > 0.9) continue;
		const users = [...groupAlphaMembers, ...groupBravoMembers];
		const mapsWithUsers = users.flatMap((u) =>
			finishedMatch.mapList.map((m) => ({ map: m, user: u })),
		);

		addReportedWeapons(
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
					groupMatchMapId: mu.map.id,
					userId: mu.user,
					weaponSplId: weapon(),
				};
			}),
		);
	}
}

async function friendCodes() {
	const allUsers = userIdsInRandomOrder();

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

async function lfgPosts() {
	const allUsers = userIdsInRandomOrder(true).slice(0, 100);

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
	const allUsers = userIdsInRandomOrder(true);

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

		const result: Array<{ userId: number; isOwner: number }> = [];
		for (let i = 0; i < count; i++) {
			const user = allUsers.shift()!;

			result.push({
				userId: user,
				isOwner: Number(i === 0),
			});
		}

		return result;
	};

	for (let i = 0; i < 20; i++) {
		const divs = divRange();
		const atTime = date();
		const hasRangeEnd = Math.random() > 0.5;
		await ScrimPostRepository.insert({
			at: atTime,
			rangeEnd: hasRangeEnd
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
		at: adminPostAtTime,
		isScheduledForFuture: true,
		text:
			faker.number.float(1) > 0.5
				? faker.lorem.sentences({ min: 1, max: 5 })
				: null,
		visibility: null,
		users: users()
			.map((u) => ({ ...u, isOwner: 0 }))
			.concat({ userId: ADMIN_ID, isOwner: 1 }),
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

	for (const id of [1, 5, 12, 14, 19]) {
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

	await ScrimPostRepository.acceptRequest(3);
}

async function associations() {
	const allUsers = userIdsInRandomOrder(true);

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
			pictureUrl:
				"http://localhost:5173/static-assets/img/tournament-logos/pn.png",
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
		sql
			.prepare(
				/* sql */ `
			update "Notification"
			set "createdAt" = @createdAt
			where "id" = @id
		`,
			)
			.run({
				createdAt: dateToDatabaseTimestamp(createdAts[i]),
				id: i + 1,
			});
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

	sql
		.prepare(
			`UPDATE "TournamentOrganizationSeries"
			SET "tierHistory" = '[3, 4, 3]'
			WHERE "organizationId" = 1 AND "name" = 'PICNIC'`,
		)
		.run();
}

function liveStreams() {
	const userIds = userIdsInAscendingOrderById();

	// Add deterministic streams for E2E testing
	// Users 6 and 7 are in ITZ tournament team 102
	const deterministicStreams = [
		{ userId: 6, viewerCount: 150, twitch: "test_player_stream_1" },
		{ userId: 7, viewerCount: 75, twitch: "test_player_stream_2" },
		// Cast-only stream (user 100 is not in ITZ tournament teams)
		{ userId: 100, viewerCount: 500, twitch: "test_cast_stream" },
	];

	for (const stream of deterministicStreams) {
		sql
			.prepare(
				`
			insert into "LiveStream" ("userId", "viewerCount", "thumbnailUrl", "twitch")
			values ($userId, $viewerCount, $thumbnailUrl, $twitch)
			`,
			)
			.run({
				userId: stream.userId,
				viewerCount: stream.viewerCount,
				thumbnailUrl: "https://picsum.photos/320/180",
				twitch: stream.twitch,
			});
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
		sql
			.prepare(
				`
			insert into "LiveStream" ("userId", "viewerCount", "thumbnailUrl", "twitch")
			values ($userId, $viewerCount, $thumbnailUrl, $twitch)
			`,
			)
			.run({
				userId,
				viewerCount,
				thumbnailUrl,
				twitch,
			});
	}
}
