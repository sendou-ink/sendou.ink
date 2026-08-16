/**
 * Structural types of the sidebar payload the root layout serves. Shapes match
 * `resolveSidebarData` on the server; declared here so presentational
 * components do not import server modules.
 */

export interface SidebarUser {
	id: number;
	username: string;
	discordId: string;
	discordAvatar: string | null;
	customUrl: string | null;
	customAvatarUrl: string | null;
}

export interface SidebarEvent {
	id: number;
	name: string;
	url: string;
	logoUrl: string | null;
	/** Whose avatar the event shows instead of a logo of its own. */
	user: SidebarUser | null;
	startsAt: number;
	type: "tournament" | "scrim";
	scrimStatus?: "booked" | "looking" | "requestPending";
}

export type FriendActivityType =
	| "SENDOUQ_MATCH"
	| "TOURNAMENT_MATCH"
	| "TOURNAMENT_WAITING"
	| "SENDOUQ"
	| "TOURNAMENT_SUB";

export interface SidebarFriend {
	id: number;
	name: string;
	discordId: string;
	discordAvatar: string | null;
	customAvatarUrl: string | null;
	url: string;
	subtitle: string;
	badge: string;
	activityType: FriendActivityType | null;
	matchId: number | null;
	tournamentId: number | null;
	streamUrl: string | null;
}

export interface SidebarStream {
	id: string;
	name: string;
	imageUrl: string;
	overlayIconUrl?: string;
	url: string;
	subtitle: string;
	startsAt: number;
	tier: number | null;
	membersPerTeam?: number;
	tentativeTier?: number;
	peakXp?: number;
	twitchUsername?: string;
}

export interface SidebarData {
	events: SidebarEvent[];
	friends: SidebarFriend[];
	streams: SidebarStream[];
	savedTournamentIds: number[];
	incomingFriendRequestIds: number[];
}

/** A notification row as served to the client, with link and icon resolved server-side. */
export interface NotificationRow {
	id: number;
	type: string;
	meta?: Record<string, string | number>;
	/** 0 = unseen, 1 = seen */
	seen: number;
	createdAt: number;
	pictureUrl?: string | null;
	href: string;
	navIcon: string;
}

/** A breadcrumb trail entry a page's load sets for the header's site title. */
export interface Breadcrumb {
	type: "IMAGE" | "TEXT";
	imgPath?: string;
	href: string;
	text?: string;
	identiconInput?: string;
}
