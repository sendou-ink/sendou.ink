import { Config } from "#lib/config.ts";

const STATIC_ASSETS_URL = Config.staticAssetsUrl;

export const LEADERBOARDS_PAGE = "/leaderboards";
export const SENDOUQ_PAGE = "/q";
export const LOG_IN_URL = "/auth";
export const API_PAGE = "/api";
export const FAQ_PAGE = "/faq";
export const WELCOME_PAGE = "/welcome";
export const SUPPORT_PAGE = "/support";
export const CONTRIBUTIONS_PAGE = "/contributions";
export const EVENTS_PAGE = "/events";
export const FRIENDS_PAGE = "/friends";
export const SETTINGS_PAGE = "/settings";
export const NOTIFICATIONS_URL = "/notifications";
export const PLANNER_URL = "/plans";
export const STOP_IMPERSONATING_URL = "/auth/impersonate/stop";

export const SENDOU_INK_BASE_URL = "https://sendou.ink";
export const SENDOU_INK_DISCORD_URL = "https://discord.gg/sendou";
export const SENDOU_INK_GITHUB_URL = "https://github.com/sendou-ink/sendou.ink";
export const NINTENDO_COMMUNITY_TOURNAMENTS_GUIDELINES_URL =
	"https://en-americas-support.nintendo.com/app/answers/detail/a_id/63454";

export const impersonateUrl = (idToLogInAs: number) =>
	`/auth/impersonate?id=${idToLogInAs}`;
export const twitchUrl = (accountName: string) =>
	`https://twitch.tv/${accountName}`;
export const tournamentInfoPage = (tournamentId: number) =>
	`/to/${tournamentId}/info`;
export const tournamentPage = (tournamentId: number) => `/to/${tournamentId}`;
export const tournamentStreamsPage = (tournamentId: number) =>
	`/to/${tournamentId}/streams`;
export const SENDOUQ_STREAMS_PAGE = "/q/streams";
export const sendouQMatchPage = (id: number) => `${SENDOUQ_PAGE}/match/${id}`;

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

export const BLANK_IMAGE_URL = `${STATIC_ASSETS_URL}/img/blank.gif`;
export const TIER_PLUS_URL = `${STATIC_ASSETS_URL}/img/tiers/plus`;
export const SENDOU_LOVE_EMOJI_PATH = `${STATIC_ASSETS_URL}/img/layout/sendou_love`;

export const FIRST_PLACEMENT_ICON_PATH = `${STATIC_ASSETS_URL}/svg/placements/first.svg`;
export const SECOND_PLACEMENT_ICON_PATH = `${STATIC_ASSETS_URL}/svg/placements/second.svg`;
export const THIRD_PLACEMENT_ICON_PATH = `${STATIC_ASSETS_URL}/svg/placements/third.svg`;

export interface UserLinkArgs {
	discordId: string;
	customUrl?: string | null;
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
	`${userPage(user)}/seasons${typeof season === "number" ? `?season=${season}` : ""}`;

export const isCustomUrl = (value: string) => {
	return Number.isNaN(Number(value));
};

export const teamPage = (customUrl: string) => `/t/${customUrl}`;

export const topSearchPage = () => "/xsearch";
export const topSearchPlayerPage = (playerId: number) =>
	`${topSearchPage()}/player/${playerId}`;

export const navIconUrl = (navItem: string) =>
	`${STATIC_ASSETS_URL}/img/layout/${navItem}`;

export const weaponCategoryUrl = (category: string) =>
	`${STATIC_ASSETS_URL}/img/weapon-categories/${category}`;

export const mainWeaponImageUrl = (mainWeaponSplId: number) =>
	`${STATIC_ASSETS_URL}/img/main-weapons/${mainWeaponSplId}`;
export const outlinedMainWeaponImageUrl = (mainWeaponSplId: number) =>
	`${STATIC_ASSETS_URL}/img/main-weapons-outlined/${mainWeaponSplId}`;
export const outlinedFiveStarMainWeaponImageUrl = (mainWeaponSplId: number) =>
	`${STATIC_ASSETS_URL}/img/main-weapons-outlined-2/${mainWeaponSplId}`;
export const outlinedTenStarMainWeaponImageUrl = (mainWeaponSplId: number) =>
	`${STATIC_ASSETS_URL}/img/main-weapons-outlined-3/${mainWeaponSplId}`;
export const subWeaponImageUrl = (subWeaponSplId: number) =>
	`${STATIC_ASSETS_URL}/img/sub-weapons/${subWeaponSplId}`;
export const specialWeaponImageUrl = (specialWeaponSplId: number) =>
	`${STATIC_ASSETS_URL}/img/special-weapons/${specialWeaponSplId}`;
export const stageImageUrl = (stageId: number) =>
	`${STATIC_ASSETS_URL}/img/stages/${stageId}`;
export const modeImageUrl = (mode: string) =>
	`${STATIC_ASSETS_URL}/img/modes/${mode}`;
export const tierImageUrl = (tier: string) =>
	`${STATIC_ASSETS_URL}/img/tiers/${tier === "CALCULATING" ? "unranked" : tier.toLowerCase()}`;
export const winnersImageUrl = ({
	season,
	placement,
}: {
	season: number;
	placement: number;
}) => `${STATIC_ASSETS_URL}/img/winners/${season}/${placement}`;

export const resolveAvatarUrl = ({
	customAvatarUrl,
	discordId,
	discordAvatar,
	size,
}: {
	customAvatarUrl?: string | null;
	discordId: string;
	discordAvatar: string | null;
	size: "sm" | "lg";
}) =>
	customAvatarUrl ??
	(discordAvatar
		? `https://cdn.discordapp.com/avatars/${discordId}/${discordAvatar}.webp?size=${size === "lg" ? 240 : 80}`
		: undefined);
