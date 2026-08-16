import { Config } from "#lib/config.ts";

const STATIC_ASSETS_URL = Config.staticAssetsUrl;

export const LEADERBOARDS_PAGE = "/leaderboards";
export const SENDOUQ_PAGE = "/q";

export const BLANK_IMAGE_URL = `${STATIC_ASSETS_URL}/img/blank.gif`;
export const TIER_PLUS_URL = `${STATIC_ASSETS_URL}/img/tiers/plus`;

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
