import slugify from "slugify";
import { Config } from "~/config";
import type { Tables } from "~/db/tables";
import type { Preference } from "~/db/tables-json";
import {
	artGridSearchParams,
	artNewSearchParams,
	artSearchParams,
} from "~/features/art/art-search-params";
import type { ArtSource } from "~/features/art/art-types";
import { associationsSearchParams } from "~/features/associations/associations-search-params";
import type { AuthErrorCode } from "~/features/auth/core/errors";
import { analyzerSearchParams } from "~/features/build-analyzer/analyzer-search-params";
import {
	calendarNewSearchParams,
	calendarSearchParams,
} from "~/features/calendar/calendar-search-params";
import type { CalendarFilters } from "~/features/calendar/calendar-types";
import { leaderboardsSearchParams } from "~/features/leaderboards/leaderboards-search-params";
import { lfgNewSearchParams } from "~/features/lfg/lfg-search-params";
import type { MapPool } from "~/features/map-list-generator/core/map-pool";
import { mapListGeneratorSearchParams } from "~/features/map-list-generator/map-list-generator-search-params";
import type {
	StageBackgroundStyle,
	StageWaterLevel,
} from "~/features/map-planner/plans-types";
import type { TierName } from "~/features/mmr/mmr-constants";
import { calculatorSearchParams } from "~/features/object-damage-calculator/calculator-search-params";
import {
	type PlusTierParam,
	plusSuggestionsSearchParams,
} from "~/features/plus-suggestions/plus-suggestions-search-params";
import {
	qSearchParams,
	weaponUsageSearchParams,
} from "~/features/sendouq/q-search-params";
import { teamJoinSearchParams } from "~/features/team/team-search-params";
import { topSearchSearchParams } from "~/features/top-search/top-search-search-params";
import { tournamentJoinSearchParams } from "~/features/tournament/tournament-search-params";
import { tournamentImportTeamsSearchParams } from "~/features/tournament-admin/tournament-admin-search-params";
import { tournamentBracketsSearchParams } from "~/features/tournament-bracket/tournament-bracket-search-params";
import { tournamentOrganizationSearchParams } from "~/features/tournament-organization/tournament-organization-search-params";
import { userCardEditSearchParams } from "~/features/user-card/user-card-search-params";
import {
	userArtSearchParams,
	userBuildsNewSearchParams,
	userResultsSearchParams,
	userSeasonSummaryGraphicSearchParams,
	userSeasonsSearchParams,
} from "~/features/user-page/user-page-search-params";
import { vodsNewSearchParams } from "~/features/vods/vods-search-params";
import type {
	Ability,
	AbilityWithUnknown,
	BrandId,
	BuildAbilitiesTupleWithUnknown,
	GearType,
	MainWeaponId,
	ModeShort,
	ModeShortWithSpecial,
	RankedModeShort,
	SpecialWeaponId,
	StageId,
	SubWeaponId,
} from "~/modules/in-game-lists/types";
import type { weaponCategories } from "~/modules/in-game-lists/weapon-ids";
import type { DayMonthYear } from "~/utils/zod";

export const discordAvatarUrl = ({
	discordId,
	discordAvatar,
	size,
}: {
	discordId: string;
	discordAvatar: string;
	size: "lg" | "sm";
}) =>
	`https://cdn.discordapp.com/avatars/${discordId}/${
		discordAvatar
	}.webp${size === "lg" ? "?size=240" : "?size=80"}`;

/**
 * Resolves the avatar image url of an user, preferring their custom avatar over
 * the Discord one. Returns undefined if the user has neither.
 */
export const resolveAvatarUrl = ({
	customAvatarUrl,
	discordId,
	discordAvatar,
	size,
}: {
	customAvatarUrl?: string | null;
	discordId: string;
	discordAvatar?: string | null;
	size: "lg" | "sm";
}) => {
	if (customAvatarUrl) return customAvatarUrl;
	if (discordAvatar) {
		return discordAvatarUrl({ discordId, discordAvatar, size });
	}

	return undefined;
};

export const SENDOU_INK_BASE_URL = "https://sendou.ink";

export const BADGES_DOC_LINK =
	"https://github.com/sendou-ink/sendou.ink/blob/rewrite/docs/badges.md";
export const API_DOC_LINK =
	"https://github.com/sendou-ink/sendou.ink/blob/rewrite/docs/dev/api.md";

export const CREATING_TOURNAMENT_DOC_LINK =
	"https://github.com/sendou-ink/sendou.ink/blob/rewrite/docs/tournament-creation.md";

export const PLUS_SERVER_DISCORD_URL = "https://discord.gg/FW4dKrY";
export const SENDOU_INK_DISCORD_URL = "https://discord.gg/sendou";
export const SENDOU_INK_PATREON_URL = "https://patreon.com/sendou";
export const NINTENDO_COMMUNITY_TOURNAMENTS_GUIDELINES_URL =
	"https://en-americas-support.nintendo.com/app/answers/detail/a_id/63454";
export const PATREON_HOW_TO_CONNECT_DISCORD_URL =
	"https://support.patreon.com/hc/en-us/articles/212052266-How-do-I-connect-Discord-to-Patreon-Patron-";
export const SENDOU_INK_GITHUB_URL = "https://github.com/sendou-ink/sendou.ink";
export const GITHUB_CONTRIBUTORS_URL =
	"https://github.com/sendou-ink/sendou.ink/graphs/contributors";
export const ipLabsMaps = (pool: string) =>
	`https://maps.iplabs.ink/?3&pool=${pool}`;
export const SPLATOON_3_INK = "https://splatoon3.ink/";
export const RHODESMAS_FREESOUND_PROFILE_URL =
	"https://freesound.org/people/rhodesmas/";
export const SPR_INFO_URL =
	"https://web.archive.org/web/20250513034545/https://www.pgstats.com/articles/introducing-spr-and-uf";
export const SPLATOON3_INK_SCHEDULES_URL =
	"https://splatoon3.ink/data/schedules.json";
export const PICOCAD2_WEB_VIEWER_URL =
	"https://picocad2-web-viewer.hfcred.workers.dev/";

export const bskyUrl = (accountName: string) =>
	`https://bsky.app/profile/${accountName}`;
export const twitchUrl = (accountName: string) =>
	`https://twitch.tv/${accountName}`;
export const youtubeUrl = (channelId: string) =>
	`https://youtube.com/channel/${channelId}`;

export const LOG_IN_URL = "/auth";
export const LOG_OUT_URL = "/auth/logout";
export const ADMIN_PAGE = "/admin";
export const API_PAGE = "/api";
export const ARTICLES_MAIN_PAGE = "/a";
export const FAQ_PAGE = "/faq";
export const WELCOME_PAGE = "/welcome";
export const SUPPORT_PAGE = "/support";
export const CONTRIBUTIONS_PAGE = "/contributions";
export const BADGES_PAGE = "/badges";
export const TROPHIES_PAGE = "/trophies";
export const NEW_TROPHY_PAGE = "/trophies/new";
export const BUILDS_PAGE = "/builds";
export const TEAM_SEARCH_PAGE = "/t";
export const NEW_TEAM_PAGE = "/t/new";
export const CALENDAR_PAGE = "/calendar";
export const CALENDAR_NEW_PAGE = "/calendar/new";
export const TOURNAMENT_NEW_PAGE = "/calendar/new?tournament=true";
export const ORGANIZATION_NEW_PAGE = "/org/new";
export const STOP_IMPERSONATING_URL = "/auth/impersonate/stop";
export const SEED_URL = "/seed";
export const PLANNER_URL = "/plans";
export const MAPS_URL = "/maps";
export const TIER_LIST_MAKER_URL = "/tier-list-maker";
export const ANALYZER_URL = "/analyzer";
export const COMP_ANALYZER_URL = "/comp-analyzer";
export const OBJECT_DAMAGE_CALCULATOR_URL = "/object-damage-calculator";
export const VODS_PAGE = "/vods";
export const LEADERBOARDS_PAGE = "/leaderboards";
export const LINKS_PAGE = "/links";
export const SENDOUQ_PAGE = "/q";
export const SENDOUQ_RULES_PAGE = "/q/rules";
export const SENDOUQ_INFO_PAGE = "/q/info";
export const MATCH_PROFILE_PAGE = "/settings?tab=match-profile";
export const SENDOUQ_PREPARING_PAGE = "/q/preparing";
export const SENDOUQ_LOOKING_PAGE = "/q/looking";
export const SENDOUQ_LOOKING_PREVIEW_PAGE = "/q/looking?preview=true";
export const SENDOUQ_STREAMS_PAGE = "/q/streams";
export const TIERS_PAGE = "/tiers";
export const SUSPENDED_PAGE = "/suspended";
export const LFG_PAGE = "/lfg";
export const EVENTS_PAGE = "/events";
export const FRIENDS_PAGE = "/friends";
export const SETTINGS_PAGE = "/settings";
const USER_CARD_EDIT_PAGE = "/user-card/edit";
export const LUTI_PAGE = "/luti";
export const PLUS_VOTING_PAGE = "/plus/voting";

const STATIC_ASSETS_URL = Config.staticAssetsUrl;

export const BLANK_IMAGE_URL = `${STATIC_ASSETS_URL}/img/blank.gif`;
export const COMMON_PREVIEW_IMAGE = `${STATIC_ASSETS_URL}/img/layout/common-preview.png`;
export const ERROR_GIRL_IMAGE_PATH = `${STATIC_ASSETS_URL}/img/layout/error-girl`;
export const SENDOU_LOVE_EMOJI_PATH = `${STATIC_ASSETS_URL}/img/layout/sendou_love`;
export const FIRST_PLACEMENT_ICON_PATH = `${STATIC_ASSETS_URL}/svg/placements/first.svg`;
export const SECOND_PLACEMENT_ICON_PATH = `${STATIC_ASSETS_URL}/svg/placements/second.svg`;
export const THIRD_PLACEMENT_ICON_PATH = `${STATIC_ASSETS_URL}/svg/placements/third.svg`;
export const WELCOME_HERO_IMAGE_PATH = `${STATIC_ASSETS_URL}/img/welcome-hero.webp`;

export const APP_ICON_URL = `${STATIC_ASSETS_URL}/img/app-icon.png`;
export const pwaSplashScreenImageUrl = (fileName: string) =>
	`${STATIC_ASSETS_URL}/img/splash-screens/${fileName}`;

export const soundPath = (fileName: string) =>
	`${STATIC_ASSETS_URL}/sounds/${fileName}.wav`;

export const GET_FRIENDS_FOR_ADDING_ROUTE = "/friends-for-adding";
export const PATRONS_LIST_ROUTE = "/patrons-list";

export const NOTIFICATIONS_URL = "/notifications";
export const NOTIFICATIONS_MARK_AS_SEEN_ROUTE = "/notifications/seen";

export const userCardFriendshipPage = (userId: number) =>
	`/user-card/${userId}/friendship`;

export const userCardNotePage = (userId: number) => `/user-card/${userId}/note`;

export const userReportPage = (userId: number) => `/user-report/${userId}`;

export const trophyPage = (trophyId: number) => `${TROPHIES_PAGE}/${trophyId}`;

export const trophyWinsPage = (args: { trophyId: number; userId: number }) =>
	`${TROPHIES_PAGE}/${args.trophyId}/wins/${args.userId}`;

export const trophyTournamentsPage = (trophyId: number) =>
	`${TROPHIES_PAGE}/${trophyId}/tournaments`;

interface UserLinkArgs {
	discordId: Tables["User"]["discordId"];
	customUrl?: Tables["User"]["customUrl"];
}

export const userPage = (user: UserLinkArgs) =>
	`/u/${user.customUrl ?? user.discordId}`;
export const userSeasonsPage = ({
	user,
	season,
}: {
	user: UserLinkArgs;
	season?: number;
}) =>
	userSeasonsSearchParams.href(`${userPage(user)}/seasons`, {
		season: season ?? null,
	});
export const userSeasonSummaryGraphicPage = ({
	user,
	season,
}: {
	user: UserLinkArgs;
	season: number;
}) =>
	userSeasonSummaryGraphicSearchParams.href(
		`${userPage(user)}/seasons/summary-graphic`,
		{ season },
	);
export const userSeasonsStatsPage = ({
	user,
	season,
	info,
}: {
	user: UserLinkArgs;
	season?: number;
	info?: "weapons" | "stages" | "mates" | "enemies";
}) =>
	userSeasonsSearchParams.href(`${userPage(user)}/seasons/stats`, {
		...(info ? { info } : {}),
		season: season ?? null,
	});
export const userEditProfilePage = (user: UserLinkArgs) =>
	`${userPage(user)}/edit`;
export const userBuildsPage = (user: UserLinkArgs) =>
	`${userPage(user)}/builds`;
export const userResultsPage = (user: UserLinkArgs, showAll?: boolean) =>
	userResultsSearchParams.href(`${userPage(user)}/results`, {
		all: Boolean(showAll),
	});
export const userVodsPage = (user: UserLinkArgs) => `${userPage(user)}/vods`;
export const userCardEditPage = (args?: { returnTo?: string }) =>
	userCardEditSearchParams.href(USER_CARD_EDIT_PAGE, {
		returnTo: args?.returnTo ?? null,
	});
export const newVodPage = (vodToEditId?: number) =>
	vodsNewSearchParams.href(`${VODS_PAGE}/new`, { vod: vodToEditId ?? null });
export const userResultsEditHighlightsPage = (user: UserLinkArgs) =>
	`${userResultsPage(user)}/highlights`;
export const userAdminPage = (user: UserLinkArgs) => `${userPage(user)}/admin`;
export const artPage = (tag?: string) =>
	artSearchParams.href("/art", { tag: tag ?? null });
export const userArtPage = (
	user: UserLinkArgs,
	source?: ArtSource,
	bigArtId?: number,
) =>
	artGridSearchParams.href(
		userArtSearchParams.href(`${userPage(user)}/art`, {
			...(source ? { source } : {}),
		}),
		{ big: bigArtId ?? null },
	);
export const newArtPage = (artId?: Tables["Art"]["id"]) =>
	artNewSearchParams.href(`${artPage()}/new`, { art: artId ?? null });
export const userNewBuildPage = (
	user: UserLinkArgs,
	params?: { weapon: MainWeaponId; build: BuildAbilitiesTupleWithUnknown },
) =>
	params
		? userBuildsNewSearchParams.href(`${userBuildsPage(user)}/new`, {
				weapon: params.weapon,
				build: params.build,
			})
		: `${userBuildsPage(user)}/new`;

export const teamPage = (customUrl: string) => `/t/${customUrl}`;
export const editTeamPage = (customUrl: string) =>
	`${teamPage(customUrl)}/edit`;
export const manageTeamRosterPage = (customUrl: string) =>
	`${teamPage(customUrl)}/roster`;
export const joinTeamPage = ({
	customUrl,
	inviteCode,
}: {
	customUrl: string;
	inviteCode: string;
}) =>
	teamJoinSearchParams.href(`${teamPage(customUrl)}/join`, {
		code: inviteCode,
	});

export const topSearchPage = (args?: {
	month: number;
	year: number;
	mode: ModeShort;
	region: Tables["XRankPlacement"]["region"];
}) =>
	args
		? topSearchSearchParams.href("/xsearch", {
				...args,
				mode: args.mode as RankedModeShort,
			})
		: "/xsearch";
export const topSearchPlayerPage = (playerId: number) =>
	`${topSearchPage()}/player/${playerId}`;

export const leaderboardsPage = (args: {
	season?: number;
	type?: "USER" | "TEAM";
}) =>
	leaderboardsSearchParams.href(LEADERBOARDS_PAGE, {
		season: args.season ?? null,
		...(args.type ? { type: args.type } : {}),
	});

export const authErrorUrl = (errorCode: AuthErrorCode) =>
	`/?authError=${errorCode}`;
export const impersonateUrl = (idToLogInAs: number) =>
	`/auth/impersonate?id=${idToLogInAs}`;
export const badgePage = (badgeId: number) => `${BADGES_PAGE}/${badgeId}`;
export const plusSuggestionPage = ({
	tier,
	showAlert,
}: {
	tier?: string | number;
	showAlert?: boolean;
} = {}) =>
	plusSuggestionsSearchParams.href("/plus/suggestions", {
		tier: tier ? (String(tier) as PlusTierParam) : null,
		alert: Boolean(showAlert),
	});
export const plusSuggestionsNewPage = (tier?: string | number) =>
	plusSuggestionsSearchParams.href("/plus/suggestions/new", {
		tier: tier ? (String(tier) as PlusTierParam) : null,
	});

export const weaponBuildPage = (weaponSlug: string) =>
	`${BUILDS_PAGE}/${weaponSlug}`;
export const weaponBuildStatsPage = (weaponSlug: string) =>
	`${weaponBuildPage(weaponSlug)}/stats`;
export const weaponBuildPopularPage = (weaponSlug: string) =>
	`${weaponBuildPage(weaponSlug)}/popular`;
export const weaponParamsPage = (weaponSlug: string) => `/params/${weaponSlug}`;

export const calendarPage = (args?: {
	filters?: CalendarFilters;
	dayMonthYear?: DayMonthYear;
}) =>
	calendarSearchParams.href(CALENDAR_PAGE, {
		...(args?.filters ? { filters: args.filters } : {}),
		...(args?.dayMonthYear
			? {
					day: args.dayMonthYear.day,
					month: args.dayMonthYear.month,
					year: args.dayMonthYear.year,
				}
			: {}),
	});

export const calendarIcalFeed = (filters?: CalendarFilters) =>
	calendarSearchParams.href(`${SENDOU_INK_BASE_URL}/calendar.ics`, {
		...(filters ? { filters } : {}),
	});

export const calendarEventPage = (eventId: number) => `/calendar/${eventId}`;
export const calendarEditPage = (eventId?: number) =>
	calendarNewSearchParams.href("/calendar/new", {
		eventId: eventId ?? null,
	});
export const tournamentEditPage = (eventId: number) =>
	calendarNewSearchParams.href("/calendar/new", {
		eventId,
		tournament: true,
	});
export const calendarReportWinnersPage = (eventId: number) =>
	`/calendar/${eventId}/report-winners`;
export const tournamentPage = (tournamentId: number) => `/to/${tournamentId}`;
export const tournamentTeamsPage = (tournamentId: number) =>
	`/to/${tournamentId}/teams`;
export const tournamentTeamPage = ({
	tournamentId,
	tournamentTeamId,
}: {
	tournamentId: number;
	tournamentTeamId: number;
}) => `/to/${tournamentId}/teams/${tournamentTeamId}`;
export const tournamentInfoPage = (tournamentId: number) =>
	`/to/${tournamentId}/info`;
export const tournamentRegisterPage = (tournamentId: number) =>
	`/to/${tournamentId}/register`;
export const tournamentRulesPage = (tournamentId: number) =>
	`/to/${tournamentId}/rules`;
export const tournamentAdminPage = (tournamentId: number) =>
	`/to/${tournamentId}/admin`;
export const tournamentAdminRegistrationPage = (tournamentId: number) =>
	`${tournamentAdminPage(tournamentId)}/registration`;
export const tournamentAdminRegistrationEditPage = (
	tournamentId: number,
	tournamentTeamId: number,
) => `${tournamentAdminRegistrationPage(tournamentId)}/${tournamentTeamId}`;
export const tournamentAdminImportTeamsPage = ({
	tournamentId,
	fromTournamentId,
}: {
	tournamentId: number;
	fromTournamentId: number;
}) =>
	tournamentImportTeamsSearchParams.href(
		`${tournamentAdminPage(tournamentId)}/import-teams`,
		{ fromTournamentId },
	);
export const tournamentBracketsPage = ({
	tournamentId,
	bracketIdx,
	groupId,
}: {
	tournamentId: number;
	bracketIdx?: number | null;
	groupId?: number;
}) =>
	tournamentBracketsSearchParams.href(`/to/${tournamentId}/brackets`, {
		idx: bracketIdx ?? null,
		group: groupId ?? null,
	});
export const tournamentDivisionsPage = (tournamentId: number) =>
	`/to/${tournamentId}/divisions`;
export const tournamentResultsPage = (tournamentId: number) =>
	`/to/${tournamentId}/results`;
export const tournamentMatchPage = ({
	tournamentId,
	matchId,
}: {
	tournamentId: number;
	matchId: number;
}) => `/to/${tournamentId}/matches/${matchId}`;
export const tournamentJoinPage = ({
	tournamentId,
	inviteCode,
}: {
	tournamentId: number;
	inviteCode: string;
}) =>
	tournamentJoinSearchParams.href(`/to/${tournamentId}/join`, {
		code: inviteCode,
	});
export const tournamentSubsPage = (tournamentId: number) => {
	return `/to/${tournamentId}/looking`;
};
export const tournamentStreamsPage = (tournamentId: number) => {
	return `/to/${tournamentId}/streams`;
};

export const tournamentOrganizationPage = ({
	organizationSlug,
	tournamentName,
}: {
	organizationSlug: string;
	tournamentName?: string;
}) =>
	tournamentOrganizationSearchParams.href(`/org/${organizationSlug}`, {
		source: tournamentName ?? null,
	});
export const tournamentOrganizationEditPage = (organizationSlug: string) =>
	`${tournamentOrganizationPage({ organizationSlug })}/edit`;
export const tournamentOrganizationStatsPage = (organizationSlug: string) =>
	`${tournamentOrganizationPage({ organizationSlug })}/stats`;

export const sendouQInviteLink = (inviteCode: string) =>
	qSearchParams.href(SENDOUQ_PAGE, { join: inviteCode });

export const sendouQMatchPage = (id: Tables["GroupMatch"]["id"]) => {
	return `${SENDOUQ_PAGE}/match/${id}`;
};

export const scrimsPage = () => {
	return "/scrims";
};

export const scrimPage = (id: number) => {
	return `${scrimsPage()}/${id}`;
};

export const newScrimPostPage = () => {
	return "/scrims/new";
};

export const associationsPage = (inviteCode?: string) =>
	associationsSearchParams.href("/associations", {
		inviteCode: inviteCode ?? null,
	});

export const newAssociationsPage = () => {
	return "/associations/new";
};

export const getWeaponUsage = (args: {
	userId: number;
	season: number;
	modeShort: ModeShort;
	stageId: StageId;
}) => weaponUsageSearchParams.href("/weapon-usage", args);

export const mapsPageWithMapPool = (mapPool: MapPool) =>
	mapListGeneratorSearchParams.href(MAPS_URL, {
		readonly: true,
		pool: mapPool.serialized,
	});
export const articlePage = (slug: string) => `${ARTICLES_MAIN_PAGE}/${slug}`;
export const analyzerPage = (args?: {
	weaponId: MainWeaponId;
	abilities: Ability[];
}) =>
	args
		? analyzerSearchParams.href("/analyzer", {
				weapon: args.weaponId,
				build: [
					args.abilities.slice(0, 4),
					args.abilities.slice(4, 8),
					args.abilities.slice(8, 12),
				] as BuildAbilitiesTupleWithUnknown,
			})
		: "/analyzer";
export const objectDamageCalculatorPage = (weaponId?: MainWeaponId) =>
	typeof weaponId === "number"
		? calculatorSearchParams.href("/object-damage-calculator", {
				weapon: { type: "MAIN", id: weaponId },
			})
		: "/object-damage-calculator";

export const vodVideoPage = (videoId: number) => `${VODS_PAGE}/${videoId}`;

export const lfgNewPostPage = (postId?: number) =>
	lfgNewSearchParams.href(`${LFG_PAGE}/new`, { postId: postId ?? null });

export const badgeUrl = ({
	code,
	extension,
}: {
	code: Tables["Badge"]["code"];
	extension?: "gif";
}) => `${STATIC_ASSETS_URL}/badges/${code}${extension ? `.${extension}` : ""}`;
export const gameBadgeUrl = (id: string) =>
	`${STATIC_ASSETS_URL}/img/badges/${id}.avif`;
export const articlePreviewUrl = (slug: string) =>
	`${STATIC_ASSETS_URL}/img/article-previews/${slug}.png`;

export const navIconUrl = (navItem: string) =>
	`${STATIC_ASSETS_URL}/img/layout/${navItem}`;
export const gearImageUrl = (gearType: GearType, gearSplId: number) =>
	`${STATIC_ASSETS_URL}/img/gear/${gearType.toLowerCase()}/${gearSplId}`;
export const weaponCategoryUrl = (
	category: (typeof weaponCategories)[number]["name"],
) => `${STATIC_ASSETS_URL}/img/weapon-categories/${category}`;
export const mainWeaponImageUrl = (mainWeaponSplId: MainWeaponId) =>
	`${STATIC_ASSETS_URL}/img/main-weapons/${mainWeaponSplId}`;
export const mainWeaponVariantImageUrl = (
	mainWeaponSplId: MainWeaponId,
	variant: "launched",
) =>
	`${STATIC_ASSETS_URL}/img/main-weapons/variants/${mainWeaponSplId}-${variant}`;
export const outlinedMainWeaponImageUrl = (mainWeaponSplId: MainWeaponId) =>
	`${STATIC_ASSETS_URL}/img/main-weapons-outlined/${mainWeaponSplId}`;
export const outlinedFiveStarMainWeaponImageUrl = (
	mainWeaponSplId: MainWeaponId,
) => `${STATIC_ASSETS_URL}/img/main-weapons-outlined-2/${mainWeaponSplId}`;
export const outlinedTenStarMainWeaponImageUrl = (
	mainWeaponSplId: MainWeaponId,
) => `${STATIC_ASSETS_URL}/img/main-weapons-outlined-3/${mainWeaponSplId}`;
export const subWeaponImageUrl = (subWeaponSplId: SubWeaponId) =>
	`${STATIC_ASSETS_URL}/img/sub-weapons/${subWeaponSplId}`;
export const specialWeaponImageUrl = (specialWeaponSplId: SpecialWeaponId) =>
	`${STATIC_ASSETS_URL}/img/special-weapons/${specialWeaponSplId}`;
export const specialWeaponVariantImageUrl = (
	specialWeaponSplId: SpecialWeaponId,
	variant: "weakpoints",
) =>
	`${STATIC_ASSETS_URL}/img/special-weapons/variants/${specialWeaponSplId}-${variant}`;
export const abilityImageUrl = (ability: AbilityWithUnknown) =>
	`${STATIC_ASSETS_URL}/img/abilities/${ability}`;
export const brandImageUrl = (brand: BrandId) =>
	`${STATIC_ASSETS_URL}/img/brands/${brand}`;
export const modeImageUrl = (mode: ModeShortWithSpecial) =>
	`${STATIC_ASSETS_URL}/img/modes/${mode}`;
export const stageImageUrl = (stageId: StageId) =>
	`${STATIC_ASSETS_URL}/img/stages/${stageId}`;
export const stageBannerImageUrl = (stageId: StageId) =>
	`${STATIC_ASSETS_URL}/img/stage-banners/${stageId}.avif`;
export const tierImageUrl = (tier: TierName | "CALCULATING") =>
	`${STATIC_ASSETS_URL}/img/tiers/${tier === "CALCULATING" ? "unranked" : tier.toLowerCase()}`;
export const controllerImageUrl = (controller: string) =>
	`${STATIC_ASSETS_URL}/img/controllers/${controller}.avif`;
export const preferenceEmojiUrl = (preference?: Preference) => {
	const emoji =
		preference === "PREFER"
			? "grin"
			: preference === "AVOID"
				? "unamused"
				: "no-mouth";

	return `${STATIC_ASSETS_URL}/img/emoji/${emoji}.svg`;
};
export const TIER_PLUS_URL = `${STATIC_ASSETS_URL}/img/tiers/plus`;

export const winnersImageUrl = ({
	season,
	placement,
}: {
	season: number;
	placement: number;
}) => `${STATIC_ASSETS_URL}/img/winners/${season}/${placement}`;

export const sqHeaderGuyImageUrl = (season: number) =>
	`${STATIC_ASSETS_URL}/img/sq-header/${season}`;

export const stageMinimapImageUrlWithEnding = ({
	stageId,
	mode,
	style,
	waterLevel,
}: {
	stageId: StageId;
	mode: ModeShort;
	style: StageBackgroundStyle;
	waterLevel?: StageWaterLevel;
}) =>
	`${STATIC_ASSETS_URL}/planner-maps/${stageId}-${mode}-${style}${
		waterLevel === "down" ? "-DOWN" : ""
	}.png`;

export function resolveBaseUrl(url: string) {
	return new URL(url).host;
}

export const mySlugify = (name: string) => {
	return slugify(name, {
		lower: true,
		strict: true,
	});
};

export const isCustomUrl = (value: string) => {
	return Number.isNaN(Number(value));
};

export function vodUrl(vod: {
	platformVideoId: string;
	timestampSeconds: number;
}) {
	return `https://www.twitch.tv/videos/${vod.platformVideoId}?t=${vod.timestampSeconds}s`;
}
