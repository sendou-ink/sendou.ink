import type { NavIcon } from "~/utils/urls";

export const FEED_CATEGORIES = [
	{ id: "SENDOUQ", label: "SendouQ", navIcon: "sendouq" },
	{ id: "LOBBIES", label: "Lobbies", navIcon: "lobbies" },
	{ id: "TOURNAMENTS", label: "Tournaments", navIcon: "medal" },
	{ id: "TEAMS", label: "Teams", navIcon: "t" },
	{ id: "SCRIMS", label: "Scrims", navIcon: "scrims" },
	{ id: "ART", label: "Art", navIcon: "art" },
	{ id: "BUILDS", label: "Builds", navIcon: "builds" },
	{ id: "VODS", label: "VoDs", navIcon: "vods" },
	{ id: "COMMUNITY", label: "Community", navIcon: "u" },
] as const;

export type FeedCategory = (typeof FEED_CATEGORIES)[number]["id"];

export type FeedAudience =
	| "SELF"
	| "TEAM"
	| "FRIENDS"
	| "FOLLOWING"
	/** Friends of friends */
	| "NETWORK"
	| "EVERYONE"
	/** Viewers with an LFG post of their own, filtered by how well they match */
	| "LFG";

/** How close the viewer is to an item's audience, the `affinity` term of the ranking score. */
export const FEED_AUDIENCE_AFFINITY: Record<FeedAudience, number> = {
	SELF: 1,
	TEAM: 1,
	FRIENDS: 1,
	FOLLOWING: 0.75,
	NETWORK: 0.5,
	EVERYONE: 0.35,
	LFG: 1,
};

export interface FeedItemTypeDefinition {
	name: string;
	category: FeedCategory;
	audience: FeedAudience[];
	/** How interesting the type is in general, 0–1 */
	baseScore: number;
	/** Hours until the recency factor halves */
	halfLifeHours: number;
	/** Describes current state, recency doesn't decay it and it shows in the "Happening now" strip */
	isLive?: boolean;
	/** Viewer's own action item, shown above the feed */
	isPinned?: boolean;
	/** Shown in the post header instead of the category, for items that clearly belong to one feature */
	feature?: { label: string; navIcon: NavIcon };
	/** Live state isn't stored, so on this test page the rows are the latest ones shifted to "now" */
	isRetimed?: boolean;
}

export const FEED_ITEM_TYPES = {
	SQ_SET: {
		name: "SendouQ set result",
		category: "SENDOUQ",
		audience: ["FRIENDS", "FOLLOWING"],
		baseScore: 0.6,
		halfLifeHours: 18,
	},

	SQ_STREAK: {
		name: "Win streak",
		category: "SENDOUQ",
		audience: ["FRIENDS"],
		baseScore: 0.5,
		halfLifeHours: 8,
	},
	SQ_LEADERBOARD: {
		name: "Leaderboard placement",
		category: "SENDOUQ",
		audience: ["FRIENDS", "FOLLOWING"],
		baseScore: 0.65,
		halfLifeHours: 24,
	},
	SQ_MILESTONE: {
		name: "Sets played milestone",
		category: "SENDOUQ",
		audience: ["FRIENDS"],
		baseScore: 0.3,
		halfLifeHours: 24,
	},
	SQ_SEASON_RECAP: {
		name: "Season recap",
		category: "SENDOUQ",
		audience: ["FRIENDS", "SELF"],
		baseScore: 0.6,
		halfLifeHours: 72,
	},
	SQ_RIVALRY: {
		name: "Rivalry",
		category: "SENDOUQ",
		audience: ["FRIENDS", "SELF"],
		baseScore: 0.35,
		halfLifeHours: 48,
	},
	SQ_META: {
		name: "Weapon trends",
		category: "SENDOUQ",
		audience: ["EVERYONE"],
		baseScore: 0.3,
		halfLifeHours: 72,
	},
	LOBBY_RECAP: {
		name: "Lobby recap",
		category: "LOBBIES",
		audience: ["FRIENDS"],
		baseScore: 0.45,
		halfLifeHours: 18,
	},
	STREAM_LIVE: {
		name: "Live now",
		category: "SENDOUQ",
		audience: ["FRIENDS", "FOLLOWING"],
		baseScore: 0.75,
		halfLifeHours: 1,
		isLive: true,
		isRetimed: true,
	},
	TO_WIN: {
		name: "Tournament win",
		category: "TOURNAMENTS",
		audience: ["FRIENDS", "FOLLOWING", "TEAM"],
		baseScore: 0.95,
		halfLifeHours: 36,
	},
	TO_PODIUM: {
		name: "Top finish",
		category: "TOURNAMENTS",
		audience: ["FRIENDS", "FOLLOWING", "TEAM"],
		baseScore: 0.7,
		halfLifeHours: 36,
	},
	TO_DIGEST: {
		name: "Weekend results digest",
		category: "TOURNAMENTS",
		audience: ["FRIENDS"],
		baseScore: 0.55,
		halfLifeHours: 48,
	},
	TO_REGISTERED: {
		name: "Friends registered",
		category: "TOURNAMENTS",
		audience: ["FRIENDS"],
		baseScore: 0.5,
		halfLifeHours: 48,
	},
	TO_UPSET: {
		name: "Upset alert",
		category: "TOURNAMENTS",
		audience: ["FRIENDS"],
		baseScore: 0.5,
		halfLifeHours: 12,
	},
	TO_LFG: {
		name: "Team needs a player",
		category: "TOURNAMENTS",
		audience: ["EVERYONE"],
		baseScore: 0.4,
		halfLifeHours: 12,
	},
	TO_ORG_NEW: {
		name: "New event from an org",
		category: "TOURNAMENTS",
		audience: ["FOLLOWING"],
		baseScore: 0.55,
		halfLifeHours: 72,
	},
	TO_SERIES: {
		name: "Series standings",
		category: "TOURNAMENTS",
		audience: ["FRIENDS", "FOLLOWING"],
		baseScore: 0.35,
		halfLifeHours: 96,
	},
	TO_VOD: {
		name: "Tournament VoD",
		category: "TOURNAMENTS",
		audience: ["FRIENDS", "FOLLOWING"],
		baseScore: 0.4,
		halfLifeHours: 48,
	},
	TO_BADGE: {
		name: "Badge earned",
		category: "TOURNAMENTS",
		audience: ["FRIENDS"],
		baseScore: 0.45,
		halfLifeHours: 48,
	},
	TO_TROPHY: {
		name: "Trophy earned",
		category: "TOURNAMENTS",
		audience: ["FRIENDS", "FOLLOWING"],
		baseScore: 0.6,
		halfLifeHours: 48,
	},
	TO_STAFF: {
		name: "Friend is organizing",
		category: "TOURNAMENTS",
		audience: ["FRIENDS"],
		baseScore: 0.3,
		halfLifeHours: 72,
	},
	TEAM_JOIN: {
		name: "Joined a team",
		category: "TEAMS",
		audience: ["FRIENDS", "TEAM"],
		baseScore: 0.5,
		halfLifeHours: 48,
	},
	TEAM_NEW: {
		name: "New team",
		category: "TEAMS",
		audience: ["FOLLOWING", "FRIENDS"],
		baseScore: 0.35,
		halfLifeHours: 72,
	},
	TEAM_AVAILABILITY: {
		name: "Best time to play",
		category: "TEAMS",
		audience: ["TEAM"],
		baseScore: 0.6,
		halfLifeHours: 48,
	},
	SCRIM_POST: {
		name: "Scrim request match",
		category: "SCRIMS",
		audience: ["TEAM"],
		baseScore: 0.45,
		halfLifeHours: 6,
	},
	SCRIM_RESULT: {
		name: "Scrim result",
		category: "SCRIMS",
		audience: ["TEAM"],
		baseScore: 0.5,
		halfLifeHours: 24,
	},
	LFG_PLAYER: {
		name: "Player looking for team",
		category: "TEAMS",
		audience: ["LFG"],
		baseScore: 0.35,
		halfLifeHours: 24,
	},
	LFG_TEAM: {
		name: "Team recruiting",
		category: "TEAMS",
		audience: ["LFG"],
		baseScore: 0.35,
		halfLifeHours: 24,
	},
	ART_NEW: {
		name: "New art",
		category: "ART",
		audience: ["FOLLOWING"],
		baseScore: 0.6,
		halfLifeHours: 48,
	},
	ART_TAGGED: {
		name: "Tagged in art",
		category: "ART",
		audience: ["FRIENDS"],
		baseScore: 0.55,
		halfLifeHours: 48,
	},
	ART_COMMISSIONS: {
		name: "Commissions open",
		category: "ART",
		audience: ["FOLLOWING"],
		baseScore: 0.5,
		halfLifeHours: 72,
	},
	BUILD_NEW: {
		name: "New build",
		category: "BUILDS",
		audience: ["FRIENDS", "FOLLOWING"],
		baseScore: 0.3,
		halfLifeHours: 48,
	},
	BUILD_FOR_YOU: {
		name: "Top build for your weapon",
		category: "BUILDS",
		audience: ["EVERYONE"],
		baseScore: 0.35,
		halfLifeHours: 72,
	},
	VOD_NEW: {
		name: "New VoD",
		category: "VODS",
		audience: ["FOLLOWING", "EVERYONE"],
		baseScore: 0.35,
		halfLifeHours: 72,
	},
	XRANK_TOP_500: {
		name: "X Rank Top 500",
		category: "COMMUNITY",
		feature: { label: "X Rank", navIcon: "xsearch" },
		audience: ["FRIENDS", "FOLLOWING"],
		baseScore: 0.65,
		halfLifeHours: 72,
	},
	SCANNER_SCORECARD: {
		name: "Scanned match scorecard",
		category: "VODS",
		feature: { label: "Scanner", navIcon: "scanner" },
		audience: ["FRIENDS"],
		baseScore: 0.4,
		halfLifeHours: 24,
	},
	FRIEND_NEW: {
		name: "New friendship",
		category: "COMMUNITY",
		audience: ["FRIENDS"],
		baseScore: 0.15,
		halfLifeHours: 24,
	},
	FRIEND_SUGGEST: {
		name: "Friend suggestion",
		category: "COMMUNITY",
		audience: ["SELF"],
		baseScore: 0.4,
		halfLifeHours: 168,
	},

	PLUS_RESULTS: {
		name: "New Plus Server tier",
		category: "COMMUNITY",
		feature: { label: "Plus Server", navIcon: "plus" },
		audience: ["FRIENDS"],
		baseScore: 0.5,
		halfLifeHours: 72,
		isRetimed: true,
	},
	SITE_UPDATE: {
		name: "sendou.ink update",
		category: "COMMUNITY",
		audience: ["EVERYONE"],
		baseScore: 0.45,
		halfLifeHours: 72,
	},
	ROTATION: {
		name: "Upcoming rotations for you",
		category: "COMMUNITY",
		audience: ["SELF"],
		baseScore: 0.3,
		halfLifeHours: 6,
	},
	VOICE_ROOM: {
		name: "Friends in voice",
		category: "COMMUNITY",
		audience: ["FRIENDS"],
		baseScore: 0.7,
		halfLifeHours: 0.5,
		isLive: true,
		isRetimed: true,
	},
	MEMORY: {
		name: "Memories",
		category: "COMMUNITY",
		audience: ["SELF"],
		baseScore: 0.25,
		halfLifeHours: 24,
	},
	CALENDAR_EVENT_NEW: {
		name: "New calendar event",
		category: "COMMUNITY",
		audience: ["EVERYONE"],
		baseScore: 0.3,
		halfLifeHours: 96,
	},
} as const satisfies Record<string, FeedItemTypeDefinition>;

export type FeedItemType = keyof typeof FEED_ITEM_TYPES;

/** Diversity pass: penalty when one of the previous two items shares the category */
export const FEED_SAME_CATEGORY_PENALTY = 0.8;
/** Diversity pass: penalty when the same actor appeared in the previous four items */
export const FEED_SAME_ACTOR_PENALTY = 0.6;

/** Weeks of match history used to find the hours a user usually plays */
export const FEED_ROTATION_LOOKBACK_WEEKS = 8;
/** An hour of the week is a usual play hour once it has matches on this many different weeks */
export const FEED_ROTATION_MIN_WEEKS = 2;

/** Rotations listed in one post, the rest are summed up as a count */
export const FEED_ROTATION_MAX_LISTED = 4;

/** A won set is an upset when the opponents' tier was at least this many steps higher (plus tiers count as a step) */
export const FEED_SQ_UPSET_MIN_TIER_STEPS = 2;

/** Sets against the same opponent this season before it can be a rivalry */
export const FEED_RIVALRY_MIN_SETS = 4;

/** A bracket win is an upset when the winner was seeded at least this many places lower */
export const FEED_TOURNAMENT_UPSET_MIN_SEED_GAP = 5;

export const SQ_SET_MILESTONES = [100, 250, 500, 1000, 1500, 2000];

/** Comments some posts start with, written by the viewer's friends */
export const FEED_MOCK_COMMENTS: Partial<Record<FeedItemType, string[]>> = {
	SQ_SET: [
		"gg, that last map was so close",
		"that comeback was unreal",
		"duo next time?",
	],
	SQ_SEASON_RECAP: [
		"new peak, congrats!",
		"that win rate on your best map is crazy",
	],
	SQ_RIVALRY: ["one more set to settle it", "best rivalry in the queue rn"],
	LOBBY_RECAP: ["that lobby was so fun", "run it back next week?"],
	TO_WIN: [
		"congrats!! well deserved",
		"that grand finals was insane",
		"first of many",
		"carried by the sub obviously",
	],
	TO_TROPHY: ["the trophy looks so good", "who made the model? love it"],
	TEAM_NEW: ["good luck with the new team!", "scrim us sometime"],
	ART_NEW: ["this is so pretty", "the colors!!"],
	SITE_UPDATE: ["finally!!", "been waiting for this one"],
};
