import slugify from 'slugify';
// import type { GearType, Preference, Tables } from "~/db/tables";
// import type { ArtSource } from "~/features/art/art-types";
// import type { AuthErrorCode } from "~/features/auth/core/errors";
// import { serializeBuild } from "~/features/build-analyzer";
// import type { CalendarFilters } from "~/features/calendar/calendar-types";
// import type { MapPool } from "~/features/map-list-generator/core/map-pool";
// import type { StageBackgroundStyle } from "~/features/map-planner";
// import type { TierName } from "~/features/mmr/mmr-constants";
// import { JOIN_CODE_SEARCH_PARAM_KEY } from "~/features/sendouq/q-constants";
// import type {
// 	Ability,
// 	AbilityWithUnknown,
// 	BrandId,
// 	BuildAbilitiesTupleWithUnknown,
// 	MainWeaponId,
// 	ModeShort,
// 	ModeShortWithSpecial,
// 	SpecialWeaponId,
// 	StageId,
// 	SubWeaponId,
// } from "~/modules/in-game-lists/types";
// import type { weaponCategories } from "~/modules/in-game-lists/weapon-ids";
// import type { DayMonthYear } from "~/utils/zod";

import type {
	Ability,
	AbilityWithUnknown,
	BuildAbilitiesTupleWithUnknown,
	MainWeaponId,
	ModeShortWithSpecial,
	SpecialWeaponId,
	SubWeaponId
} from '$lib/constants/in-game/types';
import type { weaponCategories } from '$lib/constants/in-game/weapon-ids';
import type { GearType, Tables } from '$lib/server/db/tables';
import { weaponTranslations } from './i18n';
import { resolve } from '$app/paths';

// const staticAssetsUrl = ({
// 	folder,
// 	fileName,
// }: {
// 	folder: string;
// 	fileName: string;
// }) =>
// 	`https://raw.githubusercontent.com/sendou-ink/assets/main/${folder}/${fileName}`;

export function discordAvatarUrl({
	discordId,
	discordAvatar,
	size
}: {
	discordId: string;
	discordAvatar: string;
	size: 'lg' | 'sm';
}) {
	return `https://cdn.discordapp.com/avatars/${discordId}/${
		discordAvatar
	}.webp${size === 'lg' ? '?size=240' : '?size=80'}`;
}

// export const SENDOU_INK_BASE_URL = "https://sendou.ink";

export const BADGES_DOC_LINK =
	'https://github.com/sendou-ink/sendou.ink/blob/rewrite/docs/badges.md';

// export const CREATING_TOURNAMENT_DOC_LINK =
// 	"https://github.com/sendou-ink/sendou.ink/blob/rewrite/docs/tournament-creation.md";

// export const PLUS_SERVER_DISCORD_URL = "https://discord.gg/FW4dKrY";
export const SENDOU_INK_DISCORD_URL = 'https://discord.gg/sendou';
export const SENDOU_INK_PATREON_URL = 'https://patreon.com/sendou';
export const NINTENDO_COMMUNITY_TOURNAMENTS_GUIDELINES_URL =
	'https://en-americas-support.nintendo.com/app/answers/detail/a_id/63454';
export const PATREON_HOW_TO_CONNECT_DISCORD_URL =
	'https://support.patreon.com/hc/en-us/articles/212052266-How-do-I-connect-Discord-to-Patreon-Patron-';
export const SENDOU_INK_GITHUB_URL = 'https://github.com/sendou-ink/sendou.ink';
// export const GITHUB_CONTRIBUTORS_URL =
// 	"https://github.com/sendou-ink/sendou.ink/graphs/contributors";
// export const ipLabsMaps = (pool: string) =>
// 	`https://maps.iplabs.ink/?3&pool=${pool}`;
// export const SPLATOON_3_INK = "https://splatoon3.ink/";
// export const RHODESMAS_FREESOUND_PROFILE_URL =
// 	"https://freesound.org/people/rhodesmas/";
// export const SPR_INFO_URL =
// 	"https://web.archive.org/web/20250513034545/https://www.pgstats.com/articles/introducing-spr-and-uf";

export function bskyUrl(accountName: string) {
	return `https://bsky.app/profile/${accountName}`;
}
// export const twitchUrl = (accountName: string) =>
// 	`https://twitch.tv/${accountName}`;

// export const LOG_IN_URL = "/auth";
// export const LOG_OUT_URL = "/auth/logout";
// export const ADMIN_PAGE = "/admin";
// export const ARTICLES_MAIN_PAGE = "/a";
export const FAQ_PAGE = '/faq';
export const PRIVACY_POLICY_PAGE = '/privacy-policy';
export const SUPPORT_PAGE = '/support';
export const CONTRIBUTIONS_PAGE = '/contributions';
// export const BADGES_PAGE = "/badges";
// export const BUILDS_PAGE = "/builds";
// export const USER_SEARCH_PAGE = "/u";
// export const TEAM_SEARCH_PAGE = "/t";
// export const NEW_TEAM_PAGE = "/t?new=true";
// export const CALENDAR_PAGE = "/calendar";
// export const CALENDAR_NEW_PAGE = "/calendar/new";
// export const TOURNAMENT_NEW_PAGE = "/calendar/new?tournament=true";
// export const CALENDAR_TOURNAMENTS_PAGE = "/calendar?tournaments=true";
// export const STOP_IMPERSONATING_URL = "/auth/impersonate/stop";
// export const SEED_URL = "/seed";
// export const PLANNER_URL = "/plans";
// export const MAPS_URL = "/maps";
// export const ANALYZER_URL = "/analyzer";
// export const OBJECT_DAMAGE_CALCULATOR_URL = "/object-damage-calculator";
// export const VODS_PAGE = "/vods";
// export const LEADERBOARDS_PAGE = "/leaderboards";
// export const LINKS_PAGE = "/links";
// export const SENDOUQ_PAGE = "/q";
// export const SENDOUQ_RULES_PAGE = "/q/rules";
// export const SENDOUQ_INFO_PAGE = "/q/info";
// export const SENDOUQ_SETTINGS_PAGE = "/q/settings";
// export const SENDOUQ_PREPARING_PAGE = "/q/preparing";
// export const SENDOUQ_LOOKING_PAGE = "/q/looking";
// export const SENDOUQ_LOOKING_PREVIEW_PAGE = "/q/looking?preview=true";
// export const SENDOUQ_STREAMS_PAGE = "/q/streams";
// export const TIERS_PAGE = "/tiers";
// export const SUSPENDED_PAGE = "/suspended";
// export const LFG_PAGE = "/lfg";
// export const SETTINGS_PAGE = "/settings";
// export const LUTI_PAGE = "/luti";
// export const PLUS_VOTING_PAGE = "/plus/voting";

export const BLANK_IMAGE_URL = '/img/blank.gif';
export const COMMON_PREVIEW_IMAGE = '/img/layout/common-preview.png';
// export const ERROR_GIRL_IMAGE_PATH = "/img/layout/error-girl";
// export const LOGO_PATH = "/img/layout/logo";
export const SENDOU_LOVE_EMOJI_PATH = '/img/layout/sendou_love';
// export const FIRST_PLACEMENT_ICON_PATH =
// 	"/svg/placements/first.svg";
// export const SECOND_PLACEMENT_ICON_PATH =
// 	"/svg/placements/second.svg";
// export const THIRD_PLACEMENT_ICON_PATH =
// 	"/svg/placements/third.svg";

// export const soundPath = (fileName: string) =>
// 	`/sounds/${fileName}.wav`;

// export const GET_TRUSTERS_ROUTE = "/trusters";
// export const PATRONS_LIST_ROUTE = "/patrons-list";

// export const NOTIFICATIONS_URL = "/notifications";
// export const NOTIFICATIONS_MARK_AS_SEEN_ROUTE = "/notifications/seen";

interface UserLinkArgs {
	discordId: Tables['User']['discordId'];
	customUrl?: Tables['User']['customUrl'];
}

export function userPage(user: UserLinkArgs) {
	return `/u/${user.customUrl ?? user.discordId}`;
}
// export const userSeasonsPage = ({
// 	user,
// 	season,
// }: {
// 	user: UserLinkArgs;
// 	season?: number;
// }) =>
// 	`${userPage(user)}/seasons${
// 		typeof season === "number" ? `?season=${season}` : ""
// 	}`;
// export const userEditProfilePage = (user: UserLinkArgs) =>
// 	`${userPage(user)}/edit`;
export function userBuildsPage(user: UserLinkArgs) {
	return `${userPage(user)}/builds`;
}
// export const userResultsPage = (user: UserLinkArgs, showAll?: boolean) =>
// 	`${userPage(user)}/results${showAll ? "?all=true" : ""}`;
// export const userVodsPage = (user: UserLinkArgs) => `${userPage(user)}/vods`;
// export const newVodPage = (vodToEditId?: number) =>
// 	`${VODS_PAGE}/new${vodToEditId ? `?vod=${vodToEditId}` : ""}`;
// export const userResultsEditHighlightsPage = (user: UserLinkArgs) =>
// 	`${userResultsPage(user)}/highlights`;
// export const userAdminPage = (user: UserLinkArgs) => `${userPage(user)}/admin`;
// export const artPage = (tag?: string) => `/art${tag ? `?tag=${tag}` : ""}`;
// export const userArtPage = (
// 	user: UserLinkArgs,
// 	source?: ArtSource,
// 	bigArtId?: number,
// ) =>
// 	`${userPage(user)}/art${source ? `?source=${source}` : ""}${bigArtId ? `?big=${bigArtId}` : ""}`;
// export const newArtPage = (artId?: Tables["Art"]["id"]) =>
// 	`${artPage()}/new${artId ? `?art=${artId}` : ""}`;
export function userNewBuildPage(
	user: UserLinkArgs,
	params?: { weapon: MainWeaponId; build: BuildAbilitiesTupleWithUnknown }
) {
	return `${userBuildsPage(user)}/new${
		params
			? `?${String(
					new URLSearchParams({
						weapon: String(params.weapon),
						// build: serializeBuild(params.build), // xxx: serializeBuild
						build: JSON.stringify(params.build)
					})
				)}`
			: ''
	}`;
}

// export const teamPage = (customUrl: string) => `/t/${customUrl}`;
// export const editTeamPage = (customUrl: string) =>
// 	`${teamPage(customUrl)}/edit`;
// export const manageTeamRosterPage = (customUrl: string) =>
// 	`${teamPage(customUrl)}/roster`;
// export const joinTeamPage = ({
// 	customUrl,
// 	inviteCode,
// }: {
// 	customUrl: string;
// 	inviteCode: string;
// }) => `${teamPage(customUrl)}/join?code=${inviteCode}`;

// export const topSearchPage = (args?: {
// 	month: number;
// 	year: number;
// 	mode: ModeShort;
// 	region: Tables["XRankPlacement"]["region"];
// }) =>
// 	args
// 		? `/xsearch?month=${args.month}&year=${args.year}&mode=${args.mode}&region=${args.region}`
// 		: "/xsearch";
// export const topSearchPlayerPage = (playerId: number) =>
// 	`${topSearchPage()}/player/${playerId}`;

// export const leaderboardsPage = (args: {
// 	season?: number;
// 	type?: "USER" | "TEAM";
// }) => {
// 	const params = new URLSearchParams();
// 	if (args.season) {
// 		params.set("season", String(args.season));
// 	}
// 	if (args.type) {
// 		params.set("type", args.type);
// 	}

// 	return `${LEADERBOARDS_PAGE}${params.size > 0 ? `?${params.toString()}` : ""}`;
// };

// export const authErrorUrl = (errorCode: AuthErrorCode) =>
// 	`/?authError=${errorCode}`;
// export const impersonateUrl = (idToLogInAs: number) =>
// 	`/auth/impersonate?id=${idToLogInAs}`;
// export const badgePage = (badgeId: number) => `${BADGES_PAGE}/${badgeId}`;
// export const plusSuggestionPage = ({
// 	tier,
// 	showAlert,
// }: {
// 	tier?: string | number;
// 	showAlert?: boolean;
// } = {}) => {
// 	const params = new URLSearchParams();
// 	if (tier) {
// 		params.set("tier", String(tier));
// 	}
// 	if (showAlert) {
// 		params.set("alert", "true");
// 	}
// 	return `/plus/suggestions${params.toString() ? `?${params.toString()}` : ""}`;
// };
// export const plusSuggestionsNewPage = (tier?: string | number) =>
// 	`/plus/suggestions/new${tier ? `?tier=${tier}` : ""}`;

export function weaponBuildPage(weaponId: MainWeaponId) {
	return resolve(`/builds/${mySlugify(weaponTranslations[weaponId]({}, { locale: 'en' }))}`);
}
// export const weaponBuildStatsPage = (weaponSlug: string) =>
// 	`${weaponBuildPage(weaponSlug)}/stats`;
// export const weaponBuildPopularPage = (weaponSlug: string) =>
// 	`${weaponBuildPage(weaponSlug)}/popular`;

// export const calendarPage = (args?: {
// 	filters?: CalendarFilters;
// 	dayMonthYear?: DayMonthYear;
// }) => {
// 	const params = new URLSearchParams();
// 	if (args?.filters) {
// 		params.set("filters", JSON.stringify(args.filters));
// 	}
// 	if (args?.dayMonthYear) {
// 		params.set("day", String(args.dayMonthYear.day));
// 		params.set("month", String(args.dayMonthYear.month));
// 		params.set("year", String(args.dayMonthYear.year));
// 	}

// 	return `${CALENDAR_PAGE}${params.toString() ? `?${params.toString()}` : ""}`;
// };

// export const calendarIcalFeed = (filters?: CalendarFilters) => {
// 	const params = new URLSearchParams();
// 	if (filters) {
// 		params.set("filters", JSON.stringify(filters));
// 	}
// 	return `${SENDOU_INK_BASE_URL}/calendar.ics${params.toString() ? `?${params.toString()}` : ""}`;
// };

// export const calendarEventPage = (eventId: number) => `/calendar/${eventId}`;
// export const calendarEditPage = (eventId?: number) =>
// 	`/calendar/new${eventId ? `?eventId=${eventId}` : ""}`;
// export const tournamentEditPage = (eventId: number) =>
// 	`${calendarEditPage(eventId)}&tournament=true`;
// export const calendarReportWinnersPage = (eventId: number) =>
// 	`/calendar/${eventId}/report-winners`;
// export const tournamentPage = (tournamentId: number) => `/to/${tournamentId}`;
// export const tournamentTeamPage = ({
// 	tournamentId,
// 	tournamentTeamId,
// }: {
// 	tournamentId: number;
// 	tournamentTeamId: number;
// }) => `/to/${tournamentId}/teams/${tournamentTeamId}`;
// export const tournamentRegisterPage = (tournamentId: number) =>
// 	`/to/${tournamentId}/register`;
// export const tournamentMapsPage = (tournamentId: number) =>
// 	`/to/${tournamentId}/maps`;
// export const tournamentAdminPage = (tournamentId: number) =>
// 	`/to/${tournamentId}/admin`;
export function tournamentBracketsPage({
	tournamentId,
	bracketIdx,
	groupId
}: {
	tournamentId: number;
	bracketIdx?: number | null;
	groupId?: number;
}) {
	const query = new URLSearchParams();
	if (typeof bracketIdx === 'number') {
		query.set('idx', String(bracketIdx));
	}
	if (typeof groupId === 'number') {
		query.set('group', String(groupId));
	}

	return `/to/${tournamentId}/brackets${query.size > 0 ? `?${query.toString()}` : ''}`;
}
// export const tournamentDivisionsPage = (tournamentId: number) =>
// 	`/to/${tournamentId}/divisions`;
// export const tournamentResultsPage = (tournamentId: number) =>
// 	`/to/${tournamentId}/results`;
// export const tournamentBracketsSubscribePage = (tournamentId: number) =>
// 	`/to/${tournamentId}/brackets/subscribe`;
// export const tournamentMatchPage = ({
// 	tournamentId,
// 	matchId,
// }: {
// 	tournamentId: number;
// 	matchId: number;
// }) => `/to/${tournamentId}/matches/${matchId}`;
// export const tournamentMatchSubscribePage = ({
// 	tournamentId,
// 	matchId,
// }: {
// 	tournamentId: number;
// 	matchId: number;
// }) => `/to/${tournamentId}/matches/${matchId}/subscribe`;
// export const tournamentJoinPage = ({
// 	tournamentId,
// 	inviteCode,
// }: {
// 	tournamentId: number;
// 	inviteCode: string;
// }) => `/to/${tournamentId}/join?code=${inviteCode}`;
// export const tournamentSubsPage = (tournamentId: number) => {
// 	return `/to/${tournamentId}/subs`;
// };
// export const tournamentStreamsPage = (tournamentId: number) => {
// 	return `/to/${tournamentId}/streams`;
// };

// export const tournamentOrganizationPage = ({
// 	organizationSlug,
// 	tournamentName,
// }: {
// 	organizationSlug: string;
// 	tournamentName?: string;
// }) =>
// 	`/org/${organizationSlug}${tournamentName ? `?source=${decodeURIComponent(tournamentName)}` : ""}`;
// export const tournamentOrganizationEditPage = (organizationSlug: string) =>
// 	`${tournamentOrganizationPage({ organizationSlug })}/edit`;

// export const sendouQInviteLink = (inviteCode: string) =>
// 	`${SENDOUQ_PAGE}?${JOIN_CODE_SEARCH_PARAM_KEY}=${inviteCode}`;

// export const sendouQMatchPage = (id: Tables["GroupMatch"]["id"]) => {
// 	return `${SENDOUQ_PAGE}/match/${id}`;
// };

// export const scrimsPage = () => {
// 	return "/scrims";
// };

// export const scrimPage = (id: number) => {
// 	return `${scrimsPage()}/${id}`;
// };

// export const newScrimPostPage = () => {
// 	return "/scrims/new";
// };

// export const associationsPage = (inviteCode?: string) => {
// 	return `/associations${inviteCode ? `?inviteCode=${inviteCode}` : ""}`;
// };

// export const newAssociationsPage = () => {
// 	return "/associations/new";
// };

// export const getWeaponUsage = ({
// 	userId,
// 	season,
// 	modeShort,
// 	stageId,
// }: {
// 	userId: number;
// 	season: number;
// 	modeShort: ModeShort;
// 	stageId: StageId;
// }) => {
// 	return `/weapon-usage?userId=${userId}&season=${season}&modeShort=${modeShort}&stageId=${stageId}`;
// };

// export const mapsPageWithMapPool = (mapPool: MapPool) =>
// 	`/maps?readonly&pool=${mapPool.serialized}`;
// export const articlePage = (slug: string) => `${ARTICLES_MAIN_PAGE}/${slug}`;
export function analyzerPage(args?: { weaponId: MainWeaponId; abilities: Ability[] }) {
	return `/analyzer${
		args ? `?weapon=${args.weaponId}&build=${encodeURIComponent(args.abilities.join(','))}` : ''
	}`;
}
// export const objectDamageCalculatorPage = (weaponId?: MainWeaponId) =>
// 	`/object-damage-calculator${
// 		typeof weaponId === "number" ? `?weapon=${weaponId}` : ""
// 	}`;

// export const uploadImagePage = (
// 	args:
// 		| { type: "team-pfp" | "team-banner"; teamCustomUrl: string }
// 		| { type: "org-pfp"; slug: string },
// ) =>
// 	args.type === "org-pfp"
// 		? `/upload?type=${args.type}&slug=${args.slug}`
// 		: `/upload?type=${args.type}&team=${args.teamCustomUrl}`;

// export const vodVideoPage = (videoId: number) => `${VODS_PAGE}/${videoId}`;

// export const lfgNewPostPage = (postId?: number) =>
// 	`${LFG_PAGE}/new${postId ? `?postId=${postId}` : ""}`;

export function badgeUrl({
	code,
	isAnimated
}: {
	code: Tables['Badge']['code'];
	isAnimated: boolean;
}) {
	return `/badges/${isAnimated ? 'animated' : 'static'}/${code}.avif`;
}

export function articlePreviewUrl(slug: string) {
	return `/img/article-previews/${slug}.png`;
}

export function navIconUrl(navItem: string) {
	return `/img/layout/${navItem}`;
}

export function gearImageUrl(gearType: GearType, gearSplId: number) {
	return `/img/gear/${gearType.toLowerCase()}/${gearSplId}`;
}

export function weaponCategoryUrl(category: (typeof weaponCategories)[number]['name']) {
	return `/img/weapon-categories/${category}`;
}

export function mainWeaponImageUrl(mainWeaponSplId: MainWeaponId) {
	return `/img/main-weapons/${mainWeaponSplId}`;
}
// export const mainWeaponVariantImageUrl = (
// 	mainWeaponSplId: MainWeaponId,
// 	variant: "launched",
// ) => `/img/main-weapons/variants/${mainWeaponSplId}-${variant}`;
export function outlinedMainWeaponImageUrl(mainWeaponSplId: MainWeaponId) {
	return `/img/main-weapons-outlined/${mainWeaponSplId}`;
}
export function outlinedFiveStarMainWeaponImageUrl(mainWeaponSplId: MainWeaponId) {
	return `/img/main-weapons-outlined-2/${mainWeaponSplId}`;
}
export function subWeaponImageUrl(subWeaponSplId: SubWeaponId) {
	return `/img/sub-weapons/${subWeaponSplId}`;
}
export function specialWeaponImageUrl(specialWeaponSplId: SpecialWeaponId) {
	return `/img/special-weapons/${specialWeaponSplId}`;
}
// export const specialWeaponVariantImageUrl = (
// 	specialWeaponSplId: SpecialWeaponId,
// 	variant: "weakpoints",
// ) =>
// 	`/img/special-weapons/variants/${specialWeaponSplId}-${variant}`;
export function abilityImageUrl(ability: AbilityWithUnknown) {
	return `/img/abilities/${ability}`;
}
// export const brandImageUrl = (brand: BrandId) =>
// 	`/img/brands/${brand}`;
export function modeImageUrl(mode: ModeShortWithSpecial) {
	return `/img/modes/${mode}`;
}
// export const stageImageUrl = (stageId: StageId) =>
// 	`/img/stages/${stageId}`;
// export const tierImageUrl = (tier: TierName | "CALCULATING") =>
// 	`/img/tiers/${tier.toLowerCase()}`;
// export const preferenceEmojiUrl = (preference?: Preference) => {
// 	const emoji =
// 		preference === "PREFER"
// 			? "grin"
// 			: preference === "AVOID"
// 				? "unamused"
// 				: "no-mouth";

// 	return `/img/emoji/${emoji}.svg`;
// };
// export const tournamentLogoUrl = (identifier: string) =>
// 	`/img/tournament-logos/${identifier}.png`;
// export const TIER_PLUS_URL = "/img/tiers/plus";

// export const winnersImageUrl = ({
// 	season,
// 	placement,
// }: {
// 	season: number;
// 	placement: number;
// }) => `/img/winners/${season}/${placement}`;

// export const sqHeaderGuyImageUrl = (season: number) =>
// 	`/img/sq-header/${season}`;

// export const stageMinimapImageUrlWithEnding = ({
// 	stageId,
// 	mode,
// 	style,
// }: {
// 	stageId: StageId;
// 	mode: ModeShort;
// 	style: StageBackgroundStyle;
// }) =>
// 	staticAssetsUrl({
// 		folder: "planner-maps",
// 		fileName: `${stageId}-${mode}-${style}.png`,
// 	});

// export function resolveBaseUrl(url: string) {
// 	return new URL(url).host;
// }

export function mySlugify(name: string) {
	return slugify(name, {
		lower: true,
		strict: true
	});
}

export function isCustomUrl(value: string) {
	return Number.isNaN(Number(value));
}
