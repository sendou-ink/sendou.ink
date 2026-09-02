import slugify from "slugify";
import { Config } from "~/config";
import type { Tables } from "~/db/tables";
import type { Preference } from "~/db/tables-json";
import type { AuthErrorCode } from "~/features/auth/core/errors";
import type {
	StageBackgroundStyle,
	StageWaterLevel,
} from "~/features/map-planner/plans-types";
import type { TierName } from "~/features/mmr/mmr-constants";
import type {
	AbilityWithUnknown,
	BrandId,
	GearType,
	MainWeaponId,
	ModeShort,
	ModeShortWithSpecial,
	SpecialWeaponId,
	StageId,
	SubWeaponId,
} from "~/modules/in-game-lists/types";
import type { weaponCategories } from "~/modules/in-game-lists/weapon-ids";

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

/** Avatar url preferring the custom avatar over the Discord one; undefined without either. */
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
export const SCANNER_PAGE = "/scanner";
export const VODS_PAGE = "/vods";
export const ART_PAGE = "/art";
export const XSEARCH_PAGE = "/xsearch";
export const ASSOCIATIONS_PAGE = "/associations";
export const LEADERBOARDS_PAGE = "/leaderboards";
export const LINKS_PAGE = "/links";
export const SENDOUQ_PAGE = "/q";
export const SENDOUQ_RULES_PAGE = "/q/rules";
export const SENDOUQ_INFO_PAGE = "/q/info";
export const MATCH_PROFILE_PAGE = "/settings?tab=match-profile";
export const SENDOUQ_PREPARING_PAGE = "/q/preparing";
export const SENDOUQ_LOOKING_PAGE = "/q/looking";
export const SENDOUQ_READY_PAGE = "/q/ready";
export const SENDOUQ_LOOKING_PREVIEW_PAGE = "/q/looking?preview=true";
export const SENDOUQ_STREAMS_PAGE = "/q/streams";
export const TIERS_PAGE = "/tiers";
export const SUSPENDED_PAGE = "/suspended";
export const LFG_PAGE = "/lfg";
export const EVENTS_PAGE = "/events";
export const FRIENDS_PAGE = "/friends";
export const SETTINGS_PAGE = "/settings";
export const LUTI_PAGE = "/luti";
export const PLUS_VOTING_PAGE = "/plus/voting";
export const PLUS_VOTING_RESULTS_PAGE = "/plus/voting/results";
export const PLUS_SUGGESTIONS_PAGE = "/plus/suggestions";

const STATIC_ASSETS_URL = Config.staticAssetsUrl;

export const BLANK_IMAGE_URL = `${STATIC_ASSETS_URL}/img/blank.gif`;

/** Pages with an OG image of their own (named after the nav item), rendered by `/admin/og-images`. */
export const OG_IMAGE_PAGES = [
	"settings",
	"sendouq",
	"analyzer",
	"comp-analyzer",
	"builds",
	"object-damage-calculator",
	"leaderboards",
	"scrims",
	"lfg",
	"plans",
	"trophies",
	"calendar",
	"plus",
	"xsearch",
	"articles",
	"vods",
	"art",
	"tier-list-maker",
	"links",
	"maps",
] as const;

export type OgImagePage = (typeof OG_IMAGE_PAGES)[number];

/** Preview image shown when a page is shared on Discord, Bluesky etc. */
export const ogImageUrl = (page: OgImagePage | "default") =>
	`${STATIC_ASSETS_URL}/img/og/${page}.png`;

/** Preview image of the front page, also used by pages without one of their own. */
export const DEFAULT_OG_IMAGE = ogImageUrl("default");

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

export const LAYOUT_DATA_ROUTE = "/api/layout";
export const NOTIFICATIONS_URL = "/notifications";
export const NOTIFICATIONS_MARK_AS_SEEN_ROUTE = "/notifications/seen";
export const NOTIFICATIONS_SUBSCRIBE_ROUTE = "/notifications/subscribe";
export const NOTIFICATIONS_DATA_ROUTE = "/api/notifications";

export const CHAT_ROOMS_DATA_ROUTE = "/api/chat/rooms";
export const chatRoomDataRoute = (roomId: number) =>
	`${CHAT_ROOMS_DATA_ROUTE}/${roomId}`;
export const chatRoomMessagesRoute = (roomId: number) =>
	`${chatRoomDataRoute(roomId)}/messages`;
export const chatRoomReadRoute = (roomId: number) =>
	`${chatRoomDataRoute(roomId)}/read`;

export const userCardFriendshipPage = (userId: number) =>
	`/user-card/${userId}/friendship`;

export const userCardNotePage = (userId: number) => `/user-card/${userId}/note`;

export const userReportPage = (userId: number) => `/user-report/${userId}`;

export const trophyPage = (trophyId: number) => `${TROPHIES_PAGE}/${trophyId}`;

export const trophyWinsPage = (args: { trophyId: number; userId: number }) =>
	`${TROPHIES_PAGE}/${args.trophyId}/wins/${args.userId}`;

export const trophyTournamentsPage = (trophyId: number) =>
	`${TROPHIES_PAGE}/${trophyId}/tournaments`;

export interface UserLinkArgs {
	discordId: Tables["User"]["discordId"];
	customUrl?: Tables["User"]["customUrl"];
}

export const userPage = (user: UserLinkArgs) =>
	`/u/${user.customUrl ?? user.discordId}`;
export const userEditProfilePage = (user: UserLinkArgs) =>
	`${userPage(user)}/edit`;
export const userBuildsPage = (user: UserLinkArgs) =>
	`${userPage(user)}/builds`;
export const userResultsPage = (user: UserLinkArgs) =>
	`${userPage(user)}/results`;
export const userVodsPage = (user: UserLinkArgs) => `${userPage(user)}/vods`;
export const userResultsEditHighlightsPage = (user: UserLinkArgs) =>
	`${userResultsPage(user)}/highlights`;
export const userAdminPage = (user: UserLinkArgs) => `${userPage(user)}/admin`;

export const teamPage = (customUrl: string) => `/t/${customUrl}`;
export const editTeamPage = (customUrl: string) =>
	`${teamPage(customUrl)}/edit`;
export const manageTeamRosterPage = (customUrl: string) =>
	`${teamPage(customUrl)}/roster`;
export const teamSchedulePage = (customUrl: string) =>
	`${teamPage(customUrl)}/schedule`;

export const authErrorUrl = (errorCode: AuthErrorCode) =>
	`/?authError=${errorCode}`;
export const impersonateUrl = (idToLogInAs: number) =>
	`/auth/impersonate?id=${idToLogInAs}`;
export const badgePage = (badgeId: number) => `${BADGES_PAGE}/${badgeId}`;

export const weaponBuildPage = (weaponSlug: string) =>
	`${BUILDS_PAGE}/${weaponSlug}`;
export const weaponBuildStatsPage = (weaponSlug: string) =>
	`${weaponBuildPage(weaponSlug)}/stats`;
export const weaponBuildPopularPage = (weaponSlug: string) =>
	`${weaponBuildPage(weaponSlug)}/popular`;
export const weaponParamsPage = (weaponSlug: string) => `/params/${weaponSlug}`;

export const calendarEventPage = (eventId: number) => `/calendar/${eventId}`;
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
export const tournamentTeamCompsPage = ({
	tournamentId,
	tournamentTeamId,
}: {
	tournamentId: number;
	tournamentTeamId: number;
}) => `${tournamentTeamPage({ tournamentId, tournamentTeamId })}/comps`;
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
export const tournamentSubsPage = (tournamentId: number) => {
	return `/to/${tournamentId}/looking`;
};
export const tournamentStreamsPage = (tournamentId: number) => {
	return `/to/${tournamentId}/streams`;
};

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

export const newAssociationsPage = () => {
	return "/associations/new";
};

export const articlePage = (slug: string) => `${ARTICLES_MAIN_PAGE}/${slug}`;

export const vodVideoPage = (videoId: number) => `${VODS_PAGE}/${videoId}`;

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
