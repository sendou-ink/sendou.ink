/**
 * Content stress rows of the polish database: users, teams, organizations, tournaments, events and the rest with
 * every user-entered text at the longest the site's forms accept (unbroken, wrapping words and minimal variants),
 * mixed in with the dev seed's rows. Runs right after the dev seed and returns the pages showing them, see `build-db.ts`.
 */
import { addDays, addHours, subDays, subHours, subMinutes } from "date-fns";
import * as R from "remeda";
import { resetFaker } from "~/db/seed/core/faker";
import * as SplatoonFaker from "~/db/seed/core/SplatoonFaker";
import * as ArtFactory from "~/db/seed/factories/ArtFactory";
import * as AssociationFactory from "~/db/seed/factories/AssociationFactory";
import * as BuildFactory from "~/db/seed/factories/BuildFactory";
import * as CalendarEventFactory from "~/db/seed/factories/CalendarEventFactory";
import * as CalendarEventResultFactory from "~/db/seed/factories/CalendarEventResultFactory";
import * as ChatMessageFactory from "~/db/seed/factories/ChatMessageFactory";
import * as FriendRequestFactory from "~/db/seed/factories/FriendRequestFactory";
import * as FriendshipFactory from "~/db/seed/factories/FriendshipFactory";
import * as ImageFactory from "~/db/seed/factories/ImageFactory";
import * as LFGPostFactory from "~/db/seed/factories/LFGPostFactory";
import * as LobbyFactory from "~/db/seed/factories/LobbyFactory";
import * as NotificationFactory from "~/db/seed/factories/NotificationFactory";
import * as PlusSuggestionFactory from "~/db/seed/factories/PlusSuggestionFactory";
import * as ScrimPostFactory from "~/db/seed/factories/ScrimPostFactory";
import * as SQGroupFactory from "~/db/seed/factories/SQGroupFactory";
import * as SQMatchFactory from "~/db/seed/factories/SQMatchFactory";
import * as TeamEventFactory from "~/db/seed/factories/TeamEventFactory";
import * as TeamFactory from "~/db/seed/factories/TeamFactory";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentOrganizationFactory from "~/db/seed/factories/TournamentOrganizationFactory";
import * as TournamentStaffFactory from "~/db/seed/factories/TournamentStaffFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as UserReportFactory from "~/db/seed/factories/UserReportFactory";
import * as VodFactory from "~/db/seed/factories/VodFactory";
import type { TournamentSettings } from "~/db/tables-json";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import { ART } from "~/features/art/art-constants";
import { artPage, userArtPage } from "~/features/art/art-urls";
import { ASSOCIATION } from "~/features/associations/associations-constants";
import { AVAILABILITY } from "~/features/availability/availability-constants";
import { BUILD } from "~/features/builds/builds-constants";
import {
	CALENDAR_EVENT,
	CALENDAR_EVENT_RESULT,
} from "~/features/calendar/calendar-constants";
import * as CalendarEvent from "~/features/calendar/core/CalendarEvent";
import { MESSAGE_MAX_LENGTH } from "~/features/chat/chat-constants";
import { LFG, TIMEZONES } from "~/features/lfg/lfg-constants";
import * as LobbyRepository from "~/features/lobbies/LobbyRepository.server";
import {
	LOBBY_DESCRIPTION_MAX_LENGTH,
	LOBBY_NAME_MAX_LENGTH,
	LOBBY_SPECTATOR_COUNTS,
	type LobbyRoomSize,
	PLAYERS_PER_SET,
} from "~/features/lobbies/lobbies-constants";
import { MATCH_PROFILE_WEAPON_POOL_MAX_SIZE } from "~/features/match-profile/match-profile-constants";
import type { Notification } from "~/features/notifications/notifications-types";
import { PLUS_SUGGESTION } from "~/features/plus-suggestions/plus-suggestions-constants";
import { SCRIM } from "~/features/scrims/scrims-constants";
import { FULL_GROUP_SIZE, SENDOUQ } from "~/features/sendouq/q-constants";
import * as SQMatchRepository from "~/features/sendouq-match/SQMatchRepository.server";
import { CUSTOM_ROLE_MAX_LENGTH, TEAM } from "~/features/team/team-constants";
import { TOURNAMENT } from "~/features/tournament/tournament-constants";
import { tournamentBracketsPage } from "~/features/tournament-bracket/tournament-bracket-urls";
import * as TournamentMatchRepository from "~/features/tournament-match/TournamentMatchRepository.server";
import { TOURNAMENT_ORGANIZATION } from "~/features/tournament-organization/tournament-organization-constants";
import {
	tournamentOrganizationEditPage,
	tournamentOrganizationPage,
	tournamentOrganizationStatsPage,
} from "~/features/tournament-organization/tournament-organization-urls";
import { USER_CARD } from "~/features/user-card/user-card-constants";
import type { StoredWidget } from "~/features/user-page/core/widgets/types";
import {
	IN_GAME_NAME,
	IN_GAME_NAME_MAX_LENGTH,
	inGameNameIsValid,
} from "~/features/user-page/in-game-name";
import {
	COUNTRY_CODES,
	OBJECT_PRONOUNS,
	SUBJECT_PRONOUNS,
	USER,
} from "~/features/user-page/user-page-constants";
import { userSeasonsPage } from "~/features/user-page/user-page-urls";
import { USER_REPORT } from "~/features/user-report/user-report-constants";
import { VOD } from "~/features/vods/vods-constants";
import { languagesUnified } from "~/modules/i18n/config";
import { SUPPORTER_MIN_PATRON_TIER } from "~/modules/permissions/utils";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { invariant } from "~/utils/invariant";
import { withoutInfoLogs } from "~/utils/logger";
import { toDBBoolean } from "~/utils/sql";
import {
	ASSOCIATIONS_PAGE,
	CALENDAR_PAGE,
	calendarEventPage,
	calendarReportWinnersPage,
	editTeamPage,
	FRIENDS_PAGE,
	LFG_PAGE,
	lobbiesPage,
	lobbyPage,
	MATCH_PROFILE_PAGE,
	manageTeamRosterPage,
	mySlugify,
	NOTIFICATIONS_URL,
	PLUS_SUGGESTIONS_PAGE,
	SENDOUQ_LOOKING_PAGE,
	SETTINGS_PAGE,
	scrimPage,
	scrimsPage,
	sendouQMatchPage,
	TEAM_SEARCH_PAGE,
	teamPage,
	teamResultsPage,
	teamSchedulePage,
	tournamentAdminPage,
	tournamentAdminRegistrationPage,
	tournamentInfoPage,
	tournamentMatchesPage,
	tournamentMatchPage,
	tournamentRegisterPage,
	tournamentResultsPage,
	tournamentRulesPage,
	tournamentTeamPage,
	tournamentTeamsPage,
	type UserLinkArgs,
	userAdminPage,
	userBuildsPage,
	userEditProfilePage,
	userPage,
	userResultsPage,
	userVodsPage,
	VODS_PAGE,
	vodVideoPage,
	weaponBuildPage,
} from "~/utils/urls";
import weaponTranslations from "../../locales/en/weapons.json";
import {
	numberedLogoFilename,
	SEED_NUMBERED_LOGO_COUNT,
} from "../seed-art-urls";

/** Discord's limit on a display name (`global_name`), what `discordName` holds for most users. */
const DISCORD_DISPLAY_NAME_MAX_LENGTH = 32;
/** Discord's limit on a username, lowercase letters, digits, `_` and `.` only. */
const DISCORD_USERNAME_MAX_LENGTH = 32;
/** Twitch's limit on a username, letters, digits and `_` only. */
const TWITCH_USERNAME_MAX_LENGTH = 25;

/** Stress users of each shape besides the three main ones, enough for full rosters, groups and lobbies at once. */
const POOL_SIZE = 16;
/** Ordinary teams registered next to the stress teams of each tournament. */
const NORMAL_TEAM_COUNT = 4;
/** 4v4, the size of a roster without subs. */
const ROSTER_SIZE = 4;

/** Names as people write them: other scripts, emoji, right-to-left, marks stacked on letters. Each is cut to the field's limit. */
const SCRIPT_NAMES = [
	{
		script: "Japanese",
		text: "イカしたスプラトゥーンのプレイヤーたち最強決定戦にようこそ",
	},
	{ script: "emoji", text: "🦑🐙🎮🏆🔥✨💥🎯" },
	{
		script: "Hebrew (right-to-left)",
		text: "שחקני ספלאטון הטובים ביותר בעולם כולו",
	},
	{
		script: "Arabic (right-to-left)",
		text: "أفضل لاعبي سبلاتون في العالم كله",
	},
	{ script: "stacked marks", text: "Z̸̛̪͑a̷͎͗l̶̰̈́g̵̣͝o̸̟͒ n̷̰͝a̸̧͝m̷̱̈e̶̝͝" },
] as const;

const WIDE_CHARACTER = "W";
const WIDE_LOWERCASE_CHARACTER = "w";
const NAME_WORDS =
	"Tentatek Takoroka Inkling Octoling Research Lab Splatfest Champions Squid Sisters";
const SHORT_WORDS = "Ink Up Go Win";
const PARAGRAPH =
	"Looking for chill but competitive players for weekly scrims and tournaments. We mostly play Splat Zones and Tower Control, practice on weekday evenings and review our VoDs together on Sundays. Everyone is welcome as long as you are friendly and show up on time.";
const LONG_URL_LEAD = "All the details are here:";
const LONG_URL =
	"https://sendou.ink/to/12345/brackets?idx=0&group=1&utm_source=discord&utm_medium=announcement&utm_campaign=splatoon-weekend-cup-season-finals-registration";
const SOCIAL_LINK_BASES = [
	"https://bsky.app/profile/",
	"https://twitch.tv/",
	"https://www.youtube.com/@",
	"https://x.com/",
	"https://discord.gg/",
	"https://www.instagram.com/",
	"https://www.tiktok.com/@",
	"https://ko-fi.com/",
	"https://challonge.com/",
	"https://start.gg/",
];

const LONGEST_PRONOUNS = JSON.stringify({
	subject: longest(SUBJECT_PRONOUNS),
	object: longest(OBJECT_PRONOUNS),
});
const LONGEST_COUNTRY_CODE = longest(COUNTRY_CODES);
const LONGEST_TIMEZONE = longest(TIMEZONES);
const ALL_LANGUAGES = languagesUnified.map((language) => language.code);
/** As the form offers them: every tag but the league one, which is set for leagues only. */
const CALENDAR_EVENT_TAGS = CALENDAR_EVENT.TAGS.filter(
	(tag) => tag !== "LEAGUE",
);
/** Tournaments derive their team size tag instead. */
const TOURNAMENT_TAGS = CALENDAR_EVENT_TAGS.filter(
	(tag) => !CalendarEvent.isVersusTag(tag),
);
const LARGEST_LOBBY_ROOM_SIZE = (PLAYERS_PER_SET +
	Math.max(...LOBBY_SPECTATOR_COUNTS)) as LobbyRoomSize;

export interface StressTarget {
	/** Pathname (plus search) of a page showing stress content, built with the helpers of ~/utils/urls. */
	url: string;
	/** What on the page is stressed, e.g. "team page: 64-char unbroken name, max bio, max-length custom roles". */
	label: string;
	/** User to view the page as, when it needs a login or looks different for a participant. Omit for public pages. */
	viewerId?: number;
	/** A page in a state built by a scenario (`states.ts`), with everyday content: nothing on it is at a limit. */
	kind?: "state";
}

export async function seedStress(): Promise<StressTarget[]> {
	resetFaker();

	return withoutInfoLogs(async () => {
		const targets: StressTarget[] = [];

		const users = await seedUsers(targets);
		const teams = await seedTeams(users, targets);
		const organization = await seedOrganizations(users, targets);
		const tournaments = await seedTournaments({
			users,
			teams,
			organizationId: organization.id,
			targets,
		});
		await seedCalendarEvents(users, targets);
		await seedSendouQ(users, targets);
		const lobbies = await seedLobbies(users, targets);
		const scrimId = await seedScrimsAndLFG(users, teams, targets);
		const artId = await seedBuildsArtAndVods(users, targets);
		await seedPlusSuggestions(users, targets);
		await seedAssociations(users, targets);
		const teamEventName = await seedTeamEvents(users, teams, targets);
		await seedFriends(users, targets);
		await seedUserReport(users, targets);
		await seedNotifications({
			users,
			teams,
			tournaments,
			lobbies,
			scrimId,
			artId,
			teamEventName,
			targets,
		});
		// last, so the ids of everything above (and the URLs in older findings) stay what they were
		await seedScripts(targets);

		return targets;
	});
}

interface StressUsers {
	/** Supporter with every field at its longest unbroken value, the widest slots and every role. */
	unbroken: UserLinkArgs;
	/** Every field at its longest in words. */
	words: UserLinkArgs;
	/** Shortest name, nothing optional filled in. */
	minimal: UserLinkArgs;
	unbrokenPool: number[];
	wordsPool: number[];
	/** Ordinary users with in-game names, the neighbours of the stress rows. */
	normalIds: number[];
}

type Shape = "unbroken" | "words";

async function seedUsers(targets: StressTarget[]): Promise<StressUsers> {
	const unbrokenCustomUrl = WIDE_LOWERCASE_CHARACTER.repeat(
		USER.CUSTOM_URL_MAX_LENGTH,
	);
	// the only separators a custom URL allows are - and _
	const wordsCustomUrl = words(USER.CUSTOM_URL_MAX_LENGTH)
		.toLowerCase()
		.replaceAll(" ", "-");

	const unbrokenUser = await UserFactory.create(
		{
			discordName: unbroken(DISCORD_DISPLAY_NAME_MAX_LENGTH),
			discordUniqueName: WIDE_LOWERCASE_CHARACTER.repeat(
				DISCORD_USERNAME_MAX_LENGTH,
			),
			twitch: WIDE_LOWERCASE_CHARACTER.repeat(TWITCH_USERNAME_MAX_LENGTH),
			profile: {
				customName: unbroken(USER.CUSTOM_NAME_MAX_LENGTH),
				customUrl: unbrokenCustomUrl,
				inGameName: inGameName("unbroken", ""),
				pronouns: LONGEST_PRONOUNS,
				country: LONGEST_COUNTRY_CODE,
				commissionsOpen: 1,
				commissionText: longText(USER.COMMISSION_TEXT_MAX_LENGTH),
			},
		},
		{
			patronTier: SUPPORTER_MIN_PATRON_TIER,
			roles: ["ARTIST", "VIDEO_ADDER", "TOURNAMENT_ORGANIZER"],
			card: { shortBio: unbroken(USER_CARD.SHORT_BIO_MAX_LENGTH) },
			matchProfile: fullMatchProfile(),
			widgets: supporterWidgets(),
		},
	);

	const wordsUser = await UserFactory.create(
		{
			discordName: words(DISCORD_DISPLAY_NAME_MAX_LENGTH),
			discordUniqueName: tagged(
				WIDE_LOWERCASE_CHARACTER.repeat(DISCORD_USERNAME_MAX_LENGTH),
				"2",
			),
			profile: {
				customName: words(USER.CUSTOM_NAME_MAX_LENGTH),
				customUrl: wordsCustomUrl,
				inGameName: inGameName("words", ""),
				pronouns: LONGEST_PRONOUNS,
				country: LONGEST_COUNTRY_CODE,
			},
		},
		{
			plusTier: 1,
			card: { shortBio: words(USER_CARD.SHORT_BIO_MAX_LENGTH) },
			matchProfile: fullMatchProfile(),
			widgets: regularWidgets(),
		},
	);

	const minimalUser = await UserFactory.create({
		discordName: WIDE_CHARACTER,
		profile: { customName: WIDE_CHARACTER },
		friendCode: null,
	});

	const unbrokenPool: number[] = [];
	const wordsPool: number[] = [];
	for (let i = 0; i < POOL_SIZE; i++) {
		unbrokenPool.push((await createPoolUser("unbroken", i)).id);
		wordsPool.push((await createPoolUser("words", i)).id);
	}

	const normalIds = (
		await UserFactory.createMany(NORMAL_TEAM_COUNT * ROSTER_SIZE, () => ({
			profile: { inGameName: SplatoonFaker.inGameName() },
		}))
	).map((user) => user.id);

	const users: StressUsers = {
		unbroken: { id: unbrokenUser.id, customUrl: unbrokenCustomUrl },
		words: { id: wordsUser.id, customUrl: wordsCustomUrl },
		minimal: { id: minimalUser.id, customUrl: null },
		unbrokenPool,
		wordsPool,
		normalIds,
	};

	targets.push(
		{
			url: userPage(users.unbroken),
			label:
				"user page: supporter, unbroken 32-char custom/Discord names, max in-game name, max short bio, max widgets (8000-char markdown bio, 2000-char markdown, 10 max links, 50-char countdown title, 7 weapons), max commission text",
		},
		{
			url: userPage(users.words),
			label:
				"user page: 32-char word names, max short bio in words, regular widget slots with a 3000-char bio and the longest timezone",
		},
		{
			url: userPage(users.minimal),
			label: "user page: 1-char name, nothing else filled in",
		},
		{
			url: userPage({ id: unbrokenPool[0], customUrl: null }),
			label:
				"user page: pool user with unbroken names, max short bio, long team role and org role",
		},
		{
			url: userEditProfilePage(users.unbroken),
			label: "profile edit form filled with max values",
			viewerId: users.unbroken.id,
		},
		{
			url: SETTINGS_PAGE,
			label: "settings as the unbroken max user",
			viewerId: users.unbroken.id,
		},
		{
			url: MATCH_PROFILE_PAGE,
			label: "match profile with max weapon pool and every language",
			viewerId: users.unbroken.id,
		},
	);

	return users;
}

async function createPoolUser(shape: Shape, index: number) {
	const tag = String(index + 1);
	const name = (max: number) => shaped(shape, max, tag);

	const user = await UserFactory.create(
		{
			discordName: name(DISCORD_DISPLAY_NAME_MAX_LENGTH),
			discordUniqueName: tagged(
				WIDE_LOWERCASE_CHARACTER.repeat(DISCORD_USERNAME_MAX_LENGTH),
				`${shape === "unbroken" ? "u" : "w"}${tag}`,
			),
			profile: {
				customName: name(USER.CUSTOM_NAME_MAX_LENGTH),
				inGameName: inGameName(shape, tag),
				pronouns: LONGEST_PRONOUNS,
				country: LONGEST_COUNTRY_CODE,
			},
		},
		{
			card: { shortBio: name(USER_CARD.SHORT_BIO_MAX_LENGTH) },
			matchProfile: fullMatchProfile(),
		},
	);

	if (shape === "words" && index === POOL_SIZE - 1) {
		await UserFactory.grant(user.id, { plusTier: 1 });
	}

	return user;
}

interface StressTeams {
	unbroken: { id: number; customUrl: string; name: string };
	words: { id: number; customUrl: string; name: string };
}

async function seedTeams(
	users: StressUsers,
	targets: StressTarget[],
): Promise<StressTeams> {
	const teams: StressTeams = {
		unbroken: await createStressTeam("unbroken", users, targets),
		words: await createStressTeam("words", users, targets),
	};

	const minimal = await TeamFactory.create({
		name: WIDE_CHARACTER.repeat(TEAM.NAME_MIN_LENGTH),
		memberUserIds: [users.minimal.id],
	});

	targets.push(
		{
			url: teamPage(minimal.customUrl),
			label: "team page: shortest name, one member, nothing else",
		},
		{
			url: TEAM_SEARCH_PAGE,
			label: "teams list: max-name stress teams next to the dev seed's",
		},
	);

	return teams;
}

async function createStressTeam(
	shape: Shape,
	users: StressUsers,
	targets: StressTarget[],
) {
	const owner = shape === "unbroken" ? users.unbroken : users.words;
	const pool = shape === "unbroken" ? users.unbrokenPool : users.wordsPool;
	const memberUserIds = [owner.id, ...pool.slice(0, TEAM.MAX_MEMBER_COUNT - 1)];
	const name = shaped(shape, TEAM.NAME_MAX_LENGTH);

	const team = await TeamFactory.create(
		{ name, memberUserIds },
		{
			hasAvatar: shape === "unbroken",
			managerUserIds: [pool[0]],
			roles: Object.fromEntries(
				memberUserIds.map((userId, i) => [
					userId,
					{
						customRole: shaped(shape, CUSTOM_ROLE_MAX_LENGTH, String(i + 1)),
						roleType: i % 3 === 2 ? "OTHER" : "PLAYER",
					} as const,
				]),
			),
			profile: {
				bio: longText(TEAM.BIO_MAX_LENGTH),
				tag:
					shape === "unbroken"
						? unbroken(TEAM.TAG_MAX_LENGTH)
						: words(TEAM.TAG_MAX_LENGTH, SHORT_WORDS),
				bsky: tagged(
					WIDE_LOWERCASE_CHARACTER.repeat(TEAM.BSKY_MAX_LENGTH),
					".bsky.social",
				),
			},
		},
	);

	targets.push(
		{
			url: teamPage(team.customUrl),
			label: `team page: ${TEAM.NAME_MAX_LENGTH}-char ${shape} name, max tag, max bio, ${TEAM.MAX_MEMBER_COUNT} members with ${CUSTOM_ROLE_MAX_LENGTH}-char custom roles and max user names`,
		},
		{
			url: manageTeamRosterPage(team.customUrl),
			label: `team roster editor: ${TEAM.MAX_MEMBER_COUNT} members with max ${shape} custom roles`,
			viewerId: owner.id,
		},
		{
			url: editTeamPage(team.customUrl),
			label: `team edit form: max ${shape} name, tag, Bluesky and bio`,
			viewerId: owner.id,
		},
	);

	return { id: team.id, customUrl: team.customUrl, name };
}

async function seedOrganizations(users: StressUsers, targets: StressTarget[]) {
	const roles = ["MEMBER", "ORGANIZER", "STREAMER", "ADMIN"] as const;
	const memberIds = [...users.unbrokenPool, ...users.wordsPool].slice(
		0,
		TOURNAMENT_ORGANIZATION.MAX_MEMBERS - 1,
	);

	const organization = await TournamentOrganizationFactory.create(
		{
			name: unbroken(TOURNAMENT_ORGANIZATION.NAME_MAX_LENGTH),
			ownerId: users.unbroken.id,
		},
		{
			description: longText(TOURNAMENT_ORGANIZATION.DESCRIPTION_MAX_LENGTH),
			socials: R.range(0, TOURNAMENT_ORGANIZATION.MAX_SOCIAL_LINKS).map((i) =>
				urlOfLength(
					SOCIAL_LINK_BASES[i % SOCIAL_LINK_BASES.length],
					TOURNAMENT_ORGANIZATION.SOCIAL_LINK_MAX_LENGTH,
				),
			),
			series: R.range(0, TOURNAMENT_ORGANIZATION.MAX_SERIES).map((i) => ({
				// the first two prefix the stress tournaments' names, which puts those in the series
				name:
					i === 0
						? unbroken(TOURNAMENT_ORGANIZATION.SERIES_NAME_MAX_LENGTH)
						: i === 1
							? words(TOURNAMENT_ORGANIZATION.SERIES_NAME_MAX_LENGTH)
							: shaped(
									i % 2 === 0 ? "unbroken" : "words",
									TOURNAMENT_ORGANIZATION.SERIES_NAME_MAX_LENGTH,
									String(i),
								),
				description: longText(TOURNAMENT_ORGANIZATION.DESCRIPTION_MAX_LENGTH),
				showLeaderboard: i === 0,
			})),
			members: memberIds.map((userId, i) => ({
				userId,
				role: roles[i % roles.length],
				roleDisplayName: shaped(
					users.unbrokenPool.includes(userId) ? "unbroken" : "words",
					TOURNAMENT_ORGANIZATION.MEMBER_ROLE_DISPLAY_NAME_MAX_LENGTH,
					String(i + 1),
				),
			})),
		},
	);

	const wordsOrganization = await TournamentOrganizationFactory.create(
		{
			name: words(TOURNAMENT_ORGANIZATION.NAME_MAX_LENGTH),
			ownerId: users.words.id,
		},
		{
			description: longText(TOURNAMENT_ORGANIZATION.DESCRIPTION_MAX_LENGTH),
			members: users.normalIds.slice(0, ROSTER_SIZE).map((userId, i) => ({
				userId,
				role: roles[i % roles.length],
				roleDisplayName: words(
					TOURNAMENT_ORGANIZATION.MEMBER_ROLE_DISPLAY_NAME_MAX_LENGTH,
				),
			})),
		},
	);

	const minimalOrganization = await TournamentOrganizationFactory.create({
		name: WIDE_CHARACTER.repeat(TOURNAMENT_ORGANIZATION.NAME_MIN_LENGTH),
		ownerId: users.minimal.id,
	});

	targets.push(
		{
			url: tournamentOrganizationPage({ organizationSlug: organization.slug }),
			label: `org page: ${TOURNAMENT_ORGANIZATION.NAME_MAX_LENGTH}-char unbroken name, max description, ${TOURNAMENT_ORGANIZATION.MAX_MEMBERS} members with max role names, ${TOURNAMENT_ORGANIZATION.MAX_SOCIAL_LINKS} max social links, ${TOURNAMENT_ORGANIZATION.MAX_SERIES} max-name series, max-name tournaments`,
		},
		{
			url: tournamentOrganizationEditPage(organization.slug),
			label: "org edit form: every list at its max with max texts",
			viewerId: users.unbroken.id,
		},
		{
			url: tournamentOrganizationStatsPage(organization.slug),
			label: "org stats: max org name, max-name tournaments and teams",
		},
		{
			url: tournamentOrganizationPage({
				organizationSlug: wordsOrganization.slug,
			}),
			label: "org page: max word name and description, word role names",
		},
		{
			url: tournamentOrganizationPage({
				organizationSlug: minimalOrganization.slug,
			}),
			label: "org page: shortest name, owner only",
		},
	);

	return organization;
}

interface Roster {
	/** `null` for the factory's ordinary name. */
	name: string | null;
	memberUserIds: number[];
	teamId: number | null;
	hasAvatar?: boolean;
}

interface StressTournaments {
	started: {
		id: number;
		name: string;
		bracketName: string;
		maxTeam: { id: number; name: string };
		inProgressMatchId: number;
		opponentTeamName: string;
	};
	registrationOpen: { id: number; name: string };
}

async function seedTournaments({
	users,
	teams,
	organizationId,
	targets,
}: {
	users: StressUsers;
	teams: StressTeams;
	organizationId: number;
	targets: StressTarget[];
}): Promise<StressTournaments> {
	const fullTeamSize = TOURNAMENT.MAX_MEMBERS_PER_TEAM_UPPER_LIMIT;
	const unbrokenTeamName = unbroken(TOURNAMENT.TEAM_NAME_MAX_LENGTH);
	const wordsTeamName = words(TOURNAMENT.TEAM_NAME_MAX_LENGTH);
	const rosters = (linkTeams: boolean): Roster[] => [
		{
			name: unbrokenTeamName,
			memberUserIds: [
				users.unbroken.id,
				...users.unbrokenPool.slice(0, fullTeamSize - 1),
			],
			teamId: linkTeams ? teams.unbroken.id : null,
			hasAvatar: true,
		},
		{
			name: wordsTeamName,
			memberUserIds: [
				users.words.id,
				...users.wordsPool.slice(0, fullTeamSize - 1),
			],
			teamId: linkTeams ? teams.words.id : null,
		},
		{
			name: unbrokenTagged(TOURNAMENT.TEAM_NAME_MAX_LENGTH, "2"),
			memberUserIds: users.unbrokenPool.slice(
				fullTeamSize - 1,
				fullTeamSize - 1 + ROSTER_SIZE,
			),
			teamId: null,
		},
		{
			name: wordsTagged(TOURNAMENT.TEAM_NAME_MAX_LENGTH, "2"),
			memberUserIds: users.wordsPool.slice(
				fullTeamSize - 1,
				fullTeamSize - 1 + ROSTER_SIZE,
			),
			teamId: null,
		},
		...R.chunk(users.normalIds, ROSTER_SIZE).map((memberUserIds) => ({
			name: null,
			memberUserIds,
			teamId: null,
		})),
	];

	const bracketName = unbroken(TOURNAMENT.BRACKET_NAME_MAX_LENGTH);
	const startedName = unbroken(CALENDAR_EVENT.NAME_MAX_LENGTH);
	const started = await TournamentFactory.create({
		name: startedName,
		authorId: users.unbroken.id,
		organizationId,
		avatarImgId: (
			await ImageFactory.create(
				{ submitterUserId: users.unbroken.id },
				{ isValidated: true },
			)
		).id,
		description: longText(CALENDAR_EVENT.DESCRIPTION_MAX_LENGTH),
		rules: longText(CALENDAR_EVENT.RULES_MAX_LENGTH),
		discordInviteCode: unbroken(CALENDAR_EVENT.DISCORD_INVITE_CODE_MAX_LENGTH),
		tags: TOURNAMENT_TAGS,
		startTimes: [dateToDatabaseTimestamp(subHours(new Date(), 1))],
		bracketProgression: [
			{
				type: "single_elimination",
				name: bracketName,
				requiresCheckIn: false,
				settings: {},
			},
		],
		requireInGameNames: true,
		maxMembersPerTeam: fullTeamSize,
	});
	const startedTeams = await registerTeams(started.id, rosters(false), true);
	await TournamentStaffFactory.create({
		tournamentId: started.id,
		userId: users.wordsPool[POOL_SIZE - 1],
		role: "ORGANIZER",
	});
	await TournamentStaffFactory.create({
		tournamentId: started.id,
		userId: users.unbrokenPool[POOL_SIZE - 1],
		role: "STREAMER",
	});

	await TournamentFactory.startBracket(started.id);
	const [playedMatch] = await TournamentFactory.playMatches(started.id, {
		roundNumbers: [1],
	});
	const inProgress = await TournamentFactory.firstPlayableMatch(started.id);
	await TournamentFactory.playMatches(started.id, {
		matchIds: [inProgress.matchId],
		mapCount: 1,
	});
	const inProgressRow = await TournamentMatchRepository.findMatchById(
		inProgress.matchId,
	);
	invariant(inProgressRow?.chatRoomId, "Started match has no chat room");
	const [ownTeam, opponentTeam] = [
		inProgressRow.opponentOne?.id,
		inProgressRow.opponentTwo?.id,
	].map((teamId) => {
		const team = startedTeams.find((candidate) => candidate.id === teamId);
		invariant(team, `Team ${teamId} is not a registered team`);
		return team;
	});
	await seedChat(inProgressRow.chatRoomId, [
		ownTeam.ownerUserId,
		opponentTeam.ownerUserId,
	]);

	const finalizedName = words(CALENDAR_EVENT.NAME_MAX_LENGTH);
	const finalized = await TournamentFactory.create({
		name: finalizedName,
		authorId: users.words.id,
		organizationId,
		description: longText(CALENDAR_EVENT.DESCRIPTION_MAX_LENGTH),
		rules: longText(CALENDAR_EVENT.RULES_MAX_LENGTH),
		tags: TOURNAMENT_TAGS,
		startTimes: [dateToDatabaseTimestamp(subDays(new Date(), 3))],
		bracketProgression: roundRobinToSingleElimination(),
		requireInGameNames: true,
		maxMembersPerTeam: fullTeamSize,
	});
	const finalizedTeams = await registerTeams(finalized.id, rosters(true), true);
	const [finalizedMatch] = await TournamentFactory.playOut(finalized.id, "all");

	const registrationOpenName = WIDE_CHARACTER.repeat(
		CALENDAR_EVENT.NAME_MIN_LENGTH,
	);
	const registrationOpen = await TournamentFactory.create({
		name: registrationOpenName,
		authorId: users.minimal.id,
		description: null,
		tags: null,
		discordInviteCode: null,
		startTimes: [dateToDatabaseTimestamp(addDays(new Date(), 2))],
	});
	const registrationOpenTeams = await registerTeams(
		registrationOpen.id,
		// the default team size, so the 10-member rosters sit this one out
		rosters(false).slice(2),
		false,
	);

	targets.push(
		...startedTournamentTargets({
			tournamentId: started.id,
			teamId: startedTeams[0].id,
			playedMatchId: playedMatch.id,
			inProgressMatchId: inProgress.matchId,
			viewerId: ownTeam.ownerUserId,
			authorId: users.unbroken.id,
		}),
		{
			url: tournamentBracketsPage({
				tournamentId: finalized.id,
				bracketIdx: 0,
			}),
			label:
				"finalized round robin: max word tournament and bracket names, max team names in the groups and standings",
		},
		{
			url: tournamentBracketsPage({
				tournamentId: finalized.id,
				bracketIdx: 1,
			}),
			label: "finalized single elimination fed by the round robin",
		},
		{
			url: tournamentResultsPage(finalized.id),
			label: "tournament results: max team names and max in-game names",
		},
		{
			url: tournamentTeamsPage(finalized.id),
			label: "tournament teams: max team names linked to max-name site teams",
		},
		{
			url: tournamentTeamPage({
				tournamentId: finalized.id,
				tournamentTeamId: finalizedTeams[1].id,
			}),
			label: `tournament team page: ${TOURNAMENT.TEAM_NAME_MAX_LENGTH}-char word team name, ${fullTeamSize} members with max word in-game names, played sets`,
		},
		{
			url: tournamentMatchPage({
				tournamentId: finalized.id,
				matchId: finalizedMatch.id,
			}),
			label: "finished round robin match: max team names and in-game names",
		},
		{
			url: teamResultsPage(teams.unbroken.customUrl),
			label: "team results: max team name with a max-name tournament",
		},
		{
			url: tournamentRegisterPage(registrationOpen.id),
			label: "tournament registration: shortest tournament name",
		},
		{
			url: tournamentTeamsPage(registrationOpen.id),
			label:
				"tournament teams before start: shortest tournament name, max team names",
		},
		{
			url: `${tournamentAdminPage(registrationOpen.id)}/seeds`,
			label: "seeding: max team names and in-game names",
			viewerId: users.minimal.id,
		},
		{
			url: tournamentAdminRegistrationPage(registrationOpen.id),
			label: "admin registration before start: max team names",
			viewerId: users.minimal.id,
		},
		{
			url: tournamentRegisterPage(registrationOpen.id),
			label: "registration page as a registered max-name team's member",
			viewerId: registrationOpenTeams[0].ownerUserId,
		},
	);

	return {
		started: {
			id: started.id,
			name: startedName,
			bracketName,
			maxTeam: { id: startedTeams[0].id, name: unbrokenTeamName },
			inProgressMatchId: inProgress.matchId,
			opponentTeamName: wordsTeamName,
		},
		registrationOpen: { id: registrationOpen.id, name: registrationOpenName },
	};
}

function startedTournamentTargets({
	tournamentId,
	teamId,
	playedMatchId,
	inProgressMatchId,
	viewerId,
	authorId,
}: {
	tournamentId: number;
	teamId: number;
	playedMatchId: number;
	inProgressMatchId: number;
	viewerId: number;
	authorId: number;
}): StressTarget[] {
	return [
		{
			url: tournamentBracketsPage({ tournamentId }),
			label:
				"started single elimination: 100-char unbroken tournament name, 32-char bracket name, max team names, round 1 reported",
		},
		{
			url: tournamentInfoPage(tournamentId),
			label:
				"tournament info: max unbroken name, max description, max Discord invite, every tag, max-name organization",
		},
		{
			url: tournamentRulesPage(tournamentId),
			label: "tournament rules: max-length rules",
		},
		{
			url: tournamentTeamsPage(tournamentId),
			label: "tournament teams: max team names, 10-member rosters",
		},
		{
			url: tournamentTeamPage({ tournamentId, tournamentTeamId: teamId }),
			label:
				"tournament team page: max unbroken team name, 10 members with max unbroken in-game names",
		},
		{
			url: tournamentMatchesPage(tournamentId),
			label: "tournament matches list: max team names",
			viewerId,
		},
		{
			url: tournamentMatchPage({ tournamentId, matchId: inProgressMatchId }),
			label:
				"match in progress (1 map reported): max team and in-game names, max-length chat messages",
			viewerId,
		},
		{
			url: tournamentMatchPage({ tournamentId, matchId: playedMatchId }),
			label: "finished match: max team name against an ordinary one",
		},
		{
			url: tournamentAdminPage(tournamentId),
			label: "tournament admin: max tournament and team names",
			viewerId: authorId,
		},
		{
			url: tournamentAdminRegistrationPage(tournamentId),
			label: "admin registration: max team names and member names",
			viewerId: authorId,
		},
		{
			url: `${tournamentAdminPage(tournamentId)}/staff`,
			label: "admin staff: max user names",
			viewerId: authorId,
		},
	];
}

async function registerTeams(
	tournamentId: number,
	rosters: Roster[],
	isCheckedIn: boolean,
) {
	const registered: Awaited<ReturnType<typeof TournamentTeamFactory.create>>[] =
		[];
	for (const roster of rosters) {
		registered.push(
			await TournamentTeamFactory.create(
				{
					tournamentId,
					memberUserIds: roster.memberUserIds,
					hasAvatar: roster.hasAvatar,
					...(roster.name !== null
						? {
								team: {
									name: roster.name,
									prefersNotToHost: 0,
									teamId: roster.teamId,
								},
							}
						: {}),
				},
				{ isCheckedIn },
			),
		);
	}

	return registered;
}

function roundRobinToSingleElimination(): TournamentSettings["bracketProgression"] {
	return [
		{
			type: "round_robin",
			name: words(TOURNAMENT.BRACKET_NAME_MAX_LENGTH),
			requiresCheckIn: false,
			settings: { teamsPerGroup: TOURNAMENT.RR_DEFAULT_TEAM_COUNT_PER_GROUP },
		},
		{
			type: "single_elimination",
			name: wordsTagged(TOURNAMENT.BRACKET_NAME_MAX_LENGTH, "2"),
			requiresCheckIn: false,
			settings: {},
			sources: [{ bracketIdx: 0, placements: [1, 2] }],
		},
	];
}

async function seedCalendarEvents(users: StressUsers, targets: StressTarget[]) {
	const withResults = await CalendarEventFactory.create({
		name: unbroken(CALENDAR_EVENT.NAME_MAX_LENGTH),
		authorId: users.unbroken.id,
		description: longText(CALENDAR_EVENT.DESCRIPTION_MAX_LENGTH),
		tags: CALENDAR_EVENT_TAGS,
		discordInviteCode: unbroken(CALENDAR_EVENT.DISCORD_INVITE_CODE_MAX_LENGTH),
		bracketUrl: urlOfLength(
			"https://challonge.com/",
			CALENDAR_EVENT.BRACKET_URL_MAX_LENGTH,
		),
		startTimes: [dateToDatabaseTimestamp(subHours(new Date(), 2))],
		hasAvatar: true,
	});
	await CalendarEventResultFactory.create({
		eventId: withResults.id,
		participantCount: CALENDAR_EVENT_RESULT.MAX_PARTICIPANTS_COUNT,
		results: R.range(0, CALENDAR_EVENT_RESULT.MAX_TEAMS_COUNT).map((i) => {
			const shape: Shape = i % 2 === 0 ? "unbroken" : "words";
			const registeredPlayers =
				i < POOL_SIZE / 2
					? [users.unbrokenPool[i], users.wordsPool[i]].map((userId) => ({
							userId,
							name: null,
						}))
					: [];

			return {
				teamName: shaped(
					shape,
					CALENDAR_EVENT_RESULT.MAX_TEAM_NAME_LENGTH,
					String(i + 1),
				),
				placement: i + 1,
				players: [
					...registeredPlayers,
					...R.range(
						registeredPlayers.length,
						CALENDAR_EVENT_RESULT.MAX_PLAYERS_LENGTH,
					).map((j) => ({
						userId: null,
						name: shaped(
							j % 2 === 0 ? "unbroken" : "words",
							CALENDAR_EVENT_RESULT.MAX_PLAYER_NAME_LENGTH,
							`${i + 1}-${j + 1}`,
						),
					})),
				],
			};
		}),
	});

	const multiDay = await CalendarEventFactory.create({
		name: words(CALENDAR_EVENT.NAME_MAX_LENGTH),
		authorId: users.words.id,
		description: longText(CALENDAR_EVENT.DESCRIPTION_MAX_LENGTH),
		tags: CALENDAR_EVENT_TAGS,
		discordInviteCode: tagged(
			WIDE_LOWERCASE_CHARACTER.repeat(
				CALENDAR_EVENT.DISCORD_INVITE_CODE_MAX_LENGTH,
			),
			"2",
		),
		startTimes: R.range(0, CALENDAR_EVENT.MAX_AMOUNT_OF_DATES).map((i) =>
			dateToDatabaseTimestamp(addDays(addHours(new Date(), 1), i)),
		),
	});

	const minimal = await CalendarEventFactory.create({
		name: WIDE_CHARACTER.repeat(CALENDAR_EVENT.NAME_MIN_LENGTH),
		authorId: users.minimal.id,
		description: null,
		tags: null,
		discordInviteCode: null,
		startTimes: [dateToDatabaseTimestamp(addHours(new Date(), 3))],
	});

	targets.push(
		{
			url: calendarEventPage(withResults.id),
			label: `calendar event: 100-char unbroken name, max description, every tag, max Discord invite and bracket URL, ${CALENDAR_EVENT_RESULT.MAX_TEAMS_COUNT} result teams of ${CALENDAR_EVENT_RESULT.MAX_PLAYERS_LENGTH} with max team and player names`,
		},
		{
			url: calendarReportWinnersPage(withResults.id),
			label: "report winners form filled with every team and player at max",
			viewerId: users.unbroken.id,
		},
		{
			url: calendarEventPage(multiDay.id),
			label: `calendar event: max word name, ${CALENDAR_EVENT.MAX_AMOUNT_OF_DATES} dates`,
		},
		{
			url: calendarEventPage(minimal.id),
			label: "calendar event: shortest name, nothing optional",
		},
		{
			url: CALENDAR_PAGE,
			label:
				"calendar week: max-name events and tournaments next to the dev seed's",
		},
	);
}

async function seedSendouQ(users: StressUsers, targets: StressTarget[]) {
	const groupMembers = (pool: number[], from: number) =>
		pool.slice(from, from + FULL_GROUP_SIZE);

	// concluded first: its groups go inactive, freeing the players for the lobbies
	const concluded = await SQMatchFactory.create(
		{
			alphaUserIds: [
				users.unbroken.id,
				...groupMembers(users.unbrokenPool, 9).slice(1),
			],
			bravoUserIds: [
				users.words.id,
				...groupMembers(users.wordsPool, 9).slice(1),
			],
			isMatchmade: true,
		},
		{ isConcluded: true },
	);

	for (const [shape, pool] of [
		["unbroken", users.unbrokenPool],
		["words", users.wordsPool],
	] as const) {
		const memberUserIds = groupMembers(pool, 0);
		await SQGroupFactory.create(
			{ memberUserIds },
			{
				notes: Object.fromEntries(
					memberUserIds.map((userId, i) => [
						userId,
						i % 2 === 0
							? shaped(shape, SENDOUQ.OWN_PUBLIC_NOTE_MAX_LENGTH)
							: longText(SENDOUQ.OWN_PUBLIC_NOTE_MAX_LENGTH),
					]),
				),
			},
		);
	}

	const active = await SQMatchFactory.create(
		{
			alphaUserIds: groupMembers(users.unbrokenPool, FULL_GROUP_SIZE),
			bravoUserIds: groupMembers(users.wordsPool, FULL_GROUP_SIZE),
			isMatchmade: true,
		},
		{ reportedMapCount: 2 },
	);
	const chatRoomId = await SQMatchRepository.findChatRoomIdById(active.id);
	invariant(chatRoomId, "SendouQ match has no chat room");
	await seedChat(chatRoomId, [
		active.alphaGroup.memberUserIds[0],
		active.bravoGroup.memberUserIds[0],
	]);

	targets.push(
		{
			url: SENDOUQ_LOOKING_PAGE,
			label: `SendouQ looking: full groups of max-name users with ${SENDOUQ.OWN_PUBLIC_NOTE_MAX_LENGTH}-char public notes, next to the dev seed's groups`,
			viewerId: users.unbrokenPool[0],
		},
		{
			url: sendouQMatchPage(active.id),
			label:
				"SendouQ match in progress: max names, 2 maps reported, max-length chat messages",
			viewerId: active.alphaGroup.memberUserIds[0],
		},
		{
			url: sendouQMatchPage(concluded.id),
			label: "SendouQ match concluded: max user names",
		},
		{
			url: userSeasonsPage({ user: users.unbroken }),
			label: "user seasons: max-name mates and enemies",
		},
	);
}

interface StressLobbies {
	upcoming: { id: number; name: string };
}

async function seedLobbies(
	users: StressUsers,
	targets: StressTarget[],
): Promise<StressLobbies> {
	const upcomingName = unbroken(LOBBY_NAME_MAX_LENGTH);
	const upcoming = await LobbyFactory.create(
		{
			hostUserId: users.unbroken.id,
			name: upcomingName,
			description: longText(LOBBY_DESCRIPTION_MAX_LENGTH),
			roomSize: LARGEST_LOBBY_ROOM_SIZE,
		},
		{
			signedUpUserIds: [
				...users.unbrokenPool.slice(12),
				...users.wordsPool.slice(12),
				users.words.id,
				// past the room size, so the waitlist shows too
				users.minimal.id,
			],
		},
	);

	const runningPlayerIds = [
		...users.unbrokenPool.slice(8, 8 + PLAYERS_PER_SET / 2),
		...users.wordsPool.slice(8, 8 + PLAYERS_PER_SET / 2),
	];
	const running = await LobbyFactory.create(
		{
			hostUserId: runningPlayerIds[0],
			name: words(LOBBY_NAME_MAX_LENGTH),
			description: longText(LOBBY_DESCRIPTION_MAX_LENGTH),
			startsAt: dateToDatabaseTimestamp(subMinutes(new Date(), 30)),
			roomSize: PLAYERS_PER_SET as LobbyRoomSize,
		},
		{
			signedUpUserIds: runningPlayerIds.slice(1),
			checkedInUserIds: runningPlayerIds,
			playedSetCount: 1,
			reportedMapCount: 1,
		},
	);
	const runningState = await LobbyRepository.findProgressionStateById(
		running.id,
	);
	invariant(runningState?.chatRoomId, "Lobby has no chat room");
	await seedChat(runningState.chatRoomId, runningPlayerIds.slice(0, 2));

	const minimal = await LobbyFactory.create({
		hostUserId: users.normalIds[0],
		name: WIDE_CHARACTER,
	});

	targets.push(
		{
			url: lobbyPage(upcoming.id),
			label: `lobby: ${LOBBY_NAME_MAX_LENGTH}-char unbroken name, max description, full room of max-name users plus a waitlist`,
			viewerId: users.unbroken.id,
		},
		{
			url: lobbyPage(running.id),
			label:
				"running lobby: max word name and description, a played set, max-length chat messages",
			viewerId: runningPlayerIds[0],
		},
		{
			url: lobbyPage(minimal.id),
			label: "lobby: 1-char name, no description, host only",
		},
		{
			url: lobbiesPage(),
			label: "lobbies list: max-name lobbies next to the dev seed's",
		},
	);

	return { upcoming: { id: upcoming.id, name: upcomingName } };
}

async function seedScrimsAndLFG(
	users: StressUsers,
	teams: StressTeams,
	targets: StressTarget[],
) {
	const pickup = (ownerId: number, others: number[]) =>
		[ownerId, ...others.slice(0, SCRIM.MAX_PICKUP_SIZE_EXCLUDING_OWNER)].map(
			(userId, i) => ({ userId, isOwner: toDBBoolean(i === 0) }),
		);

	await ScrimPostFactory.create(
		{
			users: pickup(users.unbroken.id, users.unbrokenPool),
			teamId: teams.unbroken.id,
			text: longText(SCRIM.POST_TEXT_MAX_LENGTH),
			startsAt: dateToDatabaseTimestamp(addHours(new Date(), 3)),
			isScheduledForFuture: true,
		},
		{ requests: [{ users: pickup(users.words.id, users.wordsPool) }] },
	);
	const accepted = await ScrimPostFactory.create(
		{
			users: pickup(users.words.id, users.wordsPool.slice(8)),
			teamId: teams.words.id,
			text: longText(SCRIM.POST_TEXT_MAX_LENGTH),
			startsAt: dateToDatabaseTimestamp(addHours(new Date(), 5)),
			isScheduledForFuture: true,
		},
		{
			requests: [
				{
					users: pickup(users.unbrokenPool[8], users.unbrokenPool.slice(9)),
					isAccepted: true,
				},
			],
		},
	);

	await LFGPostFactory.create({
		authorId: users.unbroken.id,
		type: "PLAYER_FOR_TEAM",
		text: longText(LFG.MAX_TEXT_LENGTH),
		timezone: LONGEST_TIMEZONE,
		languages: JSON.stringify(ALL_LANGUAGES),
	});
	await LFGPostFactory.create({
		authorId: users.words.id,
		type: "TEAM_FOR_PLAYER",
		teamId: teams.words.id,
		text: longText(LFG.MAX_TEXT_LENGTH),
		timezone: LONGEST_TIMEZONE,
		languages: JSON.stringify(ALL_LANGUAGES),
	});
	await LFGPostFactory.create({
		authorId: users.minimal.id,
		type: "PLAYER_FOR_COACH",
		text: WIDE_CHARACTER.repeat(LFG.MIN_TEXT_LENGTH),
	});

	targets.push(
		{
			url: scrimsPage(),
			label:
				"scrims list: max-name teams, max post texts, full pickups of max-name users, a pending request",
			viewerId: users.unbroken.id,
		},
		{
			url: scrimPage(accepted.id),
			label: "booked scrim: max word team name and max-name players",
			viewerId: users.words.id,
		},
		{
			url: LFG_PAGE,
			label:
				"LFG posts: max text, longest timezone, every language, max-name team; a 1-char post",
		},
	);

	return accepted.id;
}

async function seedBuildsArtAndVods(
	users: StressUsers,
	targets: StressTarget[],
) {
	const weaponSplIds = SplatoonFaker.mainWeapons(BUILD.MAX_WEAPONS);
	await BuildFactory.create({
		ownerId: users.unbroken.id,
		title: unbroken(BUILD.TITLE_MAX_LENGTH),
		description: longText(BUILD.DESCRIPTION_MAX_LENGTH),
		weaponSplIds,
	});
	await BuildFactory.create({
		ownerId: users.unbroken.id,
		title: words(BUILD.TITLE_MAX_LENGTH),
		description: longText(BUILD.DESCRIPTION_MAX_LENGTH),
		weaponSplIds,
	});
	await BuildFactory.create({
		ownerId: users.unbroken.id,
		title: WIDE_CHARACTER,
		description: null,
		weaponSplIds: weaponSplIds.slice(0, 1),
	});

	const tags = R.range(0, ART.TAGS_MAX_LENGTH).map((i) => ({
		name: shaped(
			i % 2 === 0 ? "unbroken" : "words",
			ART.TAG_MAX_LENGTH,
			String(i + 1),
		),
	}));
	const art = await ArtFactory.create({
		authorId: users.unbroken.id,
		url: spareImageFilename(0),
		description: longText(ART.DESCRIPTION_MAX_LENGTH),
		linkedUsers: users.unbrokenPool.slice(0, ART.LINKED_USERS_MAX_LENGTH),
		tags,
	});
	await ArtFactory.create({
		authorId: users.unbroken.id,
		url: spareImageFilename(1),
		description: unbroken(ART.DESCRIPTION_MAX_LENGTH),
	});

	const wordsVod = await VodFactory.create({
		submitterUserId: users.unbroken.id,
		title: words(VOD.TITLE_MAX_LENGTH),
		pov: { type: "NAME", name: unbroken(VOD.POV_NAME_MAX_LENGTH) },
	});
	const unbrokenVod = await VodFactory.create({
		submitterUserId: users.unbroken.id,
		title: unbroken(VOD.TITLE_MAX_LENGTH),
		type: "SCRIM",
		pov: { type: "USER", userId: users.unbroken.id },
	});

	targets.push(
		{
			url: weaponBuildPage(weaponSlug(weaponSplIds[0])),
			label: `weapon builds: ${BUILD.TITLE_MAX_LENGTH}-char unbroken and word titles, max descriptions, ${BUILD.MAX_WEAPONS} weapons, max owner name`,
		},
		{
			url: userBuildsPage(users.unbroken),
			label: "user builds: max titles and descriptions, a 1-char title",
		},
		{
			url: artPage(),
			label: "art list: max description art by a max-name artist",
		},
		{
			url: artPage(tags[0].name),
			label: `art by tag: ${ART.TAG_MAX_LENGTH}-char unbroken tag, ${ART.TAGS_MAX_LENGTH} max tags, ${ART.LINKED_USERS_MAX_LENGTH} linked max-name users`,
		},
		{
			url: userArtPage(users.unbroken),
			label: "user art: max descriptions, max tags and linked users",
		},
		{
			url: VODS_PAGE,
			label: "VoDs list: 100-char titles, max POV names",
		},
		{
			url: vodVideoPage(wordsVod.id),
			label: "VoD page: max word title, 100-char unbroken POV name",
		},
		{
			url: vodVideoPage(unbrokenVod.id),
			label: "VoD page: max unbroken title, max-name POV user",
		},
		{
			url: userVodsPage(users.unbroken),
			label: "user VoDs: max titles",
		},
	);

	return art.id;
}

async function seedPlusSuggestions(
	users: StressUsers,
	targets: StressTarget[],
) {
	await PlusSuggestionFactory.create({
		authorId: users.words.id,
		suggestedId: users.unbroken.id,
		text: longText(PLUS_SUGGESTION.TEXT_MAX_LENGTH),
	});
	await PlusSuggestionFactory.create({
		authorId: users.wordsPool[POOL_SIZE - 1],
		suggestedId: users.unbroken.id,
		text: longText(PLUS_SUGGESTION.FOLLOW_UP_COMMENT_MAX_LENGTH),
	});

	targets.push({
		url: PLUS_SUGGESTIONS_PAGE,
		label: `plus suggestions: max-name suggested user, ${PLUS_SUGGESTION.TEXT_MAX_LENGTH}-char suggestion and ${PLUS_SUGGESTION.FOLLOW_UP_COMMENT_MAX_LENGTH}-char follow-up by max-name members`,
		viewerId: users.words.id,
	});
}

async function seedAssociations(users: StressUsers, targets: StressTarget[]) {
	await AssociationFactory.create(
		{ name: unbroken(ASSOCIATION.NAME_MAX_LENGTH), userId: users.unbroken.id },
		{
			memberUserIds: users.unbrokenPool.slice(0, ROSTER_SIZE),
			managerUserIds: [users.words.id],
		},
	);
	await AssociationFactory.create(
		{ name: words(ASSOCIATION.NAME_MAX_LENGTH), userId: users.unbroken.id },
		{ memberUserIds: users.wordsPool.slice(0, ROSTER_SIZE) },
	);

	targets.push({
		url: ASSOCIATIONS_PAGE,
		label: `associations: ${ASSOCIATION.NAME_MAX_LENGTH}-char unbroken and word names, max-name members`,
		viewerId: users.unbroken.id,
	});
}

async function seedTeamEvents(
	users: StressUsers,
	teams: StressTeams,
	targets: StressTarget[],
) {
	const tomorrow = addDays(new Date(), 1);
	const name = words(AVAILABILITY.TEAM_EVENT_NAME_MAX_LENGTH);

	for (const [i, eventName] of [
		name,
		unbroken(AVAILABILITY.TEAM_EVENT_NAME_MAX_LENGTH),
	].entries()) {
		const startsAt = addHours(tomorrow, i * 3);
		await TeamEventFactory.create({
			authorId: users.unbroken.id,
			teamId: teams.unbroken.id,
			name: eventName,
			startsAt: dateToDatabaseTimestamp(startsAt),
			endsAt: dateToDatabaseTimestamp(addHours(startsAt, 2)),
		});
	}

	targets.push({
		url: teamSchedulePage(teams.unbroken.customUrl),
		label: `team schedule: ${AVAILABILITY.TEAM_EVENT_NAME_MAX_LENGTH}-char event names, max team name`,
		viewerId: users.unbroken.id,
	});

	return name;
}

async function seedFriends(users: StressUsers, targets: StressTarget[]) {
	for (const friendId of [
		users.words.id,
		users.minimal.id,
		users.unbrokenPool[0],
		users.wordsPool[0],
	]) {
		await FriendshipFactory.create({
			userOneId: users.unbroken.id,
			userTwoId: friendId,
		});
	}
	await FriendshipFactory.create({
		userOneId: users.words.id,
		userTwoId: users.unbrokenPool[0],
	});
	await FriendRequestFactory.create({
		senderId: users.unbrokenPool[1],
		receiverId: users.unbroken.id,
	});

	targets.push({
		url: FRIENDS_PAGE,
		label:
			"friends: max-name friends, mutual friends, a pending request from a max-name user",
		viewerId: users.unbroken.id,
	});
}

/**
 * Users named in scripts a Latin-only layout was never tried with, on their own pages and side by side in
 * a team's roster: glyphs taller than the line, text that runs right to left, names that break anywhere.
 */
async function seedScripts(targets: StressTarget[]) {
	const memberUserIds: number[] = [];
	for (const [index, { script, text }] of SCRIPT_NAMES.entries()) {
		const user = await UserFactory.create(
			{
				discordName: fitted(text, DISCORD_DISPLAY_NAME_MAX_LENGTH),
				discordUniqueName: `polish_script_${index + 1}`,
				profile: {
					customName: fitted(text, USER.CUSTOM_NAME_MAX_LENGTH),
					pronouns: LONGEST_PRONOUNS,
					country: LONGEST_COUNTRY_CODE,
				},
			},
			{
				card: { shortBio: fitted(text, USER_CARD.SHORT_BIO_MAX_LENGTH) },
				matchProfile: fullMatchProfile(),
			},
		);
		memberUserIds.push(user.id);
		targets.push({
			url: userPage(user),
			label: `user page: a ${USER.CUSTOM_NAME_MAX_LENGTH}-char name and a max short bio in ${script}`,
		});
	}

	const team = await TeamFactory.create({
		name: "Names of the world",
		memberUserIds,
	});
	targets.push({
		url: teamPage(team.customUrl),
		label: `team page: a roster of names in ${SCRIPT_NAMES.map(({ script }) => script).join(", ")}`,
	});
}

async function seedUserReport(users: StressUsers, targets: StressTarget[]) {
	await UserReportFactory.create({
		reportedUserId: users.unbroken.id,
		reporterUserId: users.words.id,
		description: longText(USER_REPORT.DESCRIPTION_MAX_LENGTH),
	});

	targets.push({
		url: userAdminPage(users.unbroken),
		label: `user admin tab: ${USER_REPORT.DESCRIPTION_MAX_LENGTH}-char report by a max-name user`,
		viewerId: ADMIN_ID,
	});
}

async function seedNotifications({
	users,
	teams,
	tournaments,
	lobbies,
	scrimId,
	artId,
	teamEventName,
	targets,
}: {
	users: StressUsers;
	teams: StressTeams;
	tournaments: StressTournaments;
	lobbies: StressLobbies;
	scrimId: number;
	artId: number;
	teamEventName: string;
	targets: StressTarget[];
}) {
	const adderUsername = words(USER.CUSTOM_NAME_MAX_LENGTH);
	const { started, registrationOpen } = tournaments;

	const notifications: Notification[] = [
		{
			type: "TO_ADDED_TO_TEAM",
			meta: {
				adderUsername,
				teamName: started.maxTeam.name,
				tournamentId: started.id,
				tournamentName: started.name,
				tournamentTeamId: started.maxTeam.id,
			},
		},
		{
			type: "TO_BRACKET_STARTED",
			meta: {
				tournamentId: started.id,
				tournamentName: started.name,
				bracketIdx: 0,
				bracketName: started.bracketName,
			},
		},
		{
			type: "TO_CHECK_IN_OPENED",
			meta: {
				tournamentId: registrationOpen.id,
				tournamentName: registrationOpen.name,
			},
		},
		{
			type: "TO_LEAGUE_TIMES_PROPOSED",
			meta: {
				tournamentId: started.id,
				matchId: started.inProgressMatchId,
				opponentTeamName: started.opponentTeamName,
			},
		},
		{
			type: "TEAM_EVENT_ADDED",
			meta: {
				eventName: teamEventName,
				teamName: teams.unbroken.name,
				teamCustomUrl: teams.unbroken.customUrl,
			},
		},
		{
			type: "SCRIM_SCHEDULED",
			meta: { id: scrimId, opponentTeamName: teams.words.name },
		},
		{
			type: "LOBBY_APPLICATION_RECEIVED",
			meta: {
				lobbyId: lobbies.upcoming.id,
				lobbyName: lobbies.upcoming.name,
				applicantUsername: adderUsername,
			},
		},
		{
			type: "FRIEND_REQUEST_RECEIVED",
			meta: {
				senderId: users.unbrokenPool[1],
				senderUsername: unbrokenTagged(USER.CUSTOM_NAME_MAX_LENGTH, "2"),
			},
		},
		{
			type: "TAGGED_TO_ART",
			meta: { adderUsername, adderId: users.words.id, artId },
		},
		{ type: "SQ_ADDED_TO_GROUP", meta: { adderUsername } },
	];

	for (const [i, notification] of notifications.entries()) {
		await NotificationFactory.create(
			{
				notification,
				users: [
					{
						userId: users.unbroken.id,
						seen: toDBBoolean(i >= notifications.length / 2),
					},
				],
			},
			{ createdAt: subMinutes(new Date(), (notifications.length - i) * 7) },
		);
	}

	targets.push(
		{
			url: NOTIFICATIONS_URL,
			label:
				"notifications: max tournament, team, bracket, lobby, event and user names",
			viewerId: users.unbroken.id,
		},
		{
			url: userResultsPage(users.unbroken),
			label:
				"user results: max-name tournament and calendar event results, max team names",
		},
		{
			url: userResultsPage(users.words),
			label: "user results: max word names",
		},
	);
}

async function seedChat(roomId: number, authorUserIds: number[]) {
	const [first, second] = authorUserIds;
	await ChatMessageFactory.create({
		roomId,
		authorUserId: first,
		contents: longText(MESSAGE_MAX_LENGTH),
	});
	await ChatMessageFactory.create({
		roomId,
		authorUserId: second,
		contents: urlOfLength("https://sendou.ink/u/", MESSAGE_MAX_LENGTH),
	});
	await ChatMessageFactory.create({
		roomId,
		authorUserId: first,
		contents: unbroken(MESSAGE_MAX_LENGTH),
	});
	await ChatMessageFactory.create({ roomId, authorUserId: second });
}

function fullMatchProfile() {
	return {
		weaponPool: SplatoonFaker.mainWeapons(
			MATCH_PROFILE_WEAPON_POOL_MAX_SIZE,
		).map((id) => ({ id, isFavorite: false })),
		languages: ALL_LANGUAGES,
		vc: "YES" as const,
	};
}

function supporterWidgets(): StoredWidget[] {
	return [
		{ id: "bio-md", settings: { bio: longText(USER.BIO_MD_MAX_LENGTH) } },
		{
			id: "weapon-pool",
			settings: {
				weaponPool: SplatoonFaker.mainWeapons(USER.WEAPON_POOL_WIDGET_MAX).map(
					(id) => ({ id, isFavorite: false }),
				),
			},
		},
		{ id: "lfg-posts" },
		{ id: "art", settings: { source: "ALL" } },
		{ id: "badges-owned", settings: { favoriteBadgeIds: [] } },
		{ id: "map-mode-preferences" },
		{ id: "teams" },
		{ id: "organizations" },
		{ id: "social-links" },
		{
			id: "countdown",
			settings: {
				title: unbroken(USER.COUNTDOWN_TITLE_MAX_LENGTH),
				date: addDays(new Date(), 42),
			},
		},
		{
			id: "markdown",
			settings: { content: longText(USER.MARKDOWN_WIDGET_MAX_LENGTH) },
		},
		{
			id: "links",
			settings: {
				links: R.range(0, USER.LINKS_WIDGET_MAX_LINKS).map((i) =>
					urlOfLength(
						SOCIAL_LINK_BASES[i % SOCIAL_LINK_BASES.length],
						USER.LINKS_WIDGET_LINK_MAX_LENGTH,
					),
				),
			},
		},
		{ id: "commissions" },
	];
}

function regularWidgets(): StoredWidget[] {
	return [
		{ id: "bio", settings: { bio: longText(USER.BIO_MAX_LENGTH) } },
		{
			id: "weapon-pool",
			settings: {
				weaponPool: SplatoonFaker.mainWeapons(USER.WEAPON_POOL_WIDGET_MAX).map(
					(id) => ({ id, isFavorite: true }),
				),
			},
		},
		{ id: "lfg-posts" },
		{ id: "badges-owned", settings: { favoriteBadgeIds: [] } },
		{ id: "teams" },
		{ id: "organizations" },
		{ id: "social-links" },
		{ id: "friends" },
		{ id: "timezone", settings: { timezone: LONGEST_TIMEZONE } },
	];
}

/** The dev seed uses every seeded art image, and `ImageFactory` takes the numbered logos from the bottom up. */
function spareImageFilename(index: number) {
	return numberedLogoFilename(SEED_NUMBERED_LOGO_COUNT - 1 - index);
}

function weaponSlug(weaponSplId: number) {
	const name =
		weaponTranslations[
			`MAIN_${weaponSplId}` as keyof typeof weaponTranslations
		];
	invariant(name, `No English name for weapon ${weaponSplId}`);

	return mySlugify(name);
}

/** `name#discriminator` with both parts at their longest. */
function inGameName(shape: Shape, tag: string) {
	const name = shaped(shape, IN_GAME_NAME.NAME_MAX_LENGTH, tag, SHORT_WORDS);
	const value = `${name}#${"m".repeat(IN_GAME_NAME.DISCRIMINATOR_MAX_LENGTH)}`;
	invariant(
		inGameNameIsValid(value) && value.length === IN_GAME_NAME_MAX_LENGTH,
		`Invalid in-game name ${value}`,
	);

	return value;
}

function shaped(shape: Shape, max: number, tag = "", phrase = NAME_WORDS) {
	return shape === "unbroken"
		? unbrokenTagged(max, tag)
		: wordsTagged(max, tag, phrase);
}

function unbroken(max: number) {
	return exactly(WIDE_CHARACTER.repeat(max), max);
}

/** Unbroken, ending in `tag` to tell apart rows that have to differ. */
function unbrokenTagged(max: number, tag: string) {
	return tagged(WIDE_CHARACTER.repeat(max), tag);
}

/** `phrase` repeated and cut to exactly `max`, never ending in a space as the forms trim. */
function words(max: number, phrase = NAME_WORDS) {
	let text = phrase;
	while (text.length < max) {
		text += ` ${phrase}`;
	}

	return exactly(endOnWord(text.slice(0, max)), max);
}

function wordsTagged(max: number, tag: string, phrase = NAME_WORDS) {
	if (!tag) return words(max, phrase);

	return exactly(`${words(max - tag.length - 1, phrase)} ${tag}`, max);
}

/** Paragraphs of words with a long URL near the start, as pasted links are, cut to exactly `max`. */
function longText(max: number) {
	let text = `${LONG_URL_LEAD} ${LONG_URL}`;
	while (text.length < max) {
		text += `\n\n${PARAGRAPH}`;
	}

	return exactly(endOnWord(text.slice(0, max)), max);
}

/** `text` repeated up to `max` characters, cut between whole characters as a person would have typed them. */
function fitted(text: string, max: number) {
	const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
	let result = "";
	for (const { segment } of segmenter.segment(
		`${text} `.repeat(Math.ceil(max / text.length) + 1),
	)) {
		if (result.length + segment.length > max) break;
		result += segment;
	}

	return result.trimEnd();
}

function urlOfLength(base: string, max: number) {
	return exactly(
		`${base}${WIDE_LOWERCASE_CHARACTER.repeat(max - base.length)}`,
		max,
	);
}

/** `text` with its end swapped for `tag`, keeping the length. */
function tagged(text: string, tag: string) {
	return exactly(text.slice(0, text.length - tag.length) + tag, text.length);
}

function endOnWord(text: string) {
	return /\s$/.test(text) ? `${text.slice(0, -1)}s` : text;
}

function exactly(text: string, max: number) {
	invariant(text.length === max, `Expected ${max} characters: ${text}`);

	return text;
}

function longest<T extends string>(values: readonly T[]): T {
	const value = R.firstBy(values, [(candidate) => candidate.length, "desc"]);
	invariant(value, "Expected a value");

	return value;
}
