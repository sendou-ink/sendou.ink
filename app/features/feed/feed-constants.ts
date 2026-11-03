import type { NavIcon } from "~/utils/urls";
import type { FeedEventType } from "./feed-types";

export const FEED_CATEGORIES = [
	{ id: "SENDOUQ", label: "SendouQ", navIcon: "sendouq" },
	{ id: "LOBBIES", label: "Lobbies", navIcon: "lobbies" },
	{ id: "TOURNAMENTS", label: "Tournaments", navIcon: "medal" },
	{ id: "TEAMS", label: "Teams", navIcon: "t" },
	{ id: "LFG", label: "LFG", navIcon: "lfg" },
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

/** Why a post about a person is in the viewer's feed, closest first */
export const FEED_RELATIONS = ["SELF", "FRIEND", "TEAMMATE"] as const;

export type FeedRelation = (typeof FEED_RELATIONS)[number];

/** The audience whose affinity a post with the relation gets */
export const FEED_RELATION_AUDIENCE: Record<FeedRelation, FeedAudience> = {
	SELF: "SELF",
	FRIEND: "FRIENDS",
	TEAMMATE: "TEAM",
};

export interface FeedItemTypeDefinition {
	name: string;
	category: FeedCategory;
	audience: FeedAudience[];
	/** How interesting the type is in general, 0–1 */
	baseScore: number;
	/** Hours until the recency factor halves */
	halfLifeHours: number;
	/** Viewer's own action item, shown above the feed */
	isPinned?: boolean;
	/** Shown in the post header instead of the category, for items that clearly belong to one feature */
	feature?: { label: string; navIcon: NavIcon };
	/** Not shown when the site is opened as an installed app */
	isHiddenInPwa?: boolean;
	/** Nothing to talk about (a notice or a listing): no comments, reactions or sharing, the post opens what it's about instead */
	isNotice?: boolean;
	/** Most posts of the type in the feed at once, 1 by default */
	maxCount?: number;
}

export const FEED_ITEM_TYPES = {
	SQ_SET: {
		name: "SendouQ set result",
		category: "SENDOUQ",
		audience: ["FRIENDS", "TEAM", "FOLLOWING"],
		baseScore: 0.6,
		halfLifeHours: 18,
		maxCount: 4,
	},

	SQ_STREAK: {
		name: "Win streak",
		category: "SENDOUQ",
		audience: ["FRIENDS", "TEAM"],
		baseScore: 0.5,
		halfLifeHours: 8,
		maxCount: 2,
	},
	SQ_LEADERBOARD: {
		name: "Leaderboard placement",
		category: "SENDOUQ",
		audience: ["FRIENDS", "TEAM", "FOLLOWING"],
		baseScore: 0.65,
		halfLifeHours: 24,
	},
	SQ_MILESTONE: {
		name: "Sets played milestone",
		category: "SENDOUQ",
		audience: ["FRIENDS", "TEAM"],
		baseScore: 0.3,
		halfLifeHours: 24,
		maxCount: 2,
	},
	SQ_SEASON_RECAP: {
		name: "Season recap",
		category: "SENDOUQ",
		audience: ["FRIENDS", "TEAM", "SELF"],
		baseScore: 0.6,
		halfLifeHours: 72,
	},
	SQ_RIVALRY: {
		name: "Rivalry",
		category: "SENDOUQ",
		audience: ["FRIENDS", "TEAM", "SELF"],
		baseScore: 0.35,
		halfLifeHours: 48,
	},
	SQ_SEASON_START: {
		name: "Season starting",
		category: "SENDOUQ",
		audience: ["EVERYONE"],
		baseScore: 0.7,
		halfLifeHours: 48,
	},
	SQ_SEASON_ENDING: {
		name: "Season ending soon",
		category: "SENDOUQ",
		audience: ["SELF"],
		baseScore: 0.8,
		halfLifeHours: 72,
		isPinned: true,
		isNotice: true,
	},
	LEADERBOARD_TOP: {
		name: "Weekly leaderboard",
		category: "SENDOUQ",
		feature: { label: "Leaderboards", navIcon: "leaderboards" },
		audience: ["EVERYONE"],
		baseScore: 0.45,
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
		audience: ["FRIENDS", "TEAM"],
		baseScore: 0.45,
		halfLifeHours: 18,
	},
	TO_WIN: {
		name: "Tournament win",
		category: "TOURNAMENTS",
		audience: ["FRIENDS", "FOLLOWING", "TEAM"],
		baseScore: 0.95,
		halfLifeHours: 36,
		maxCount: 3,
	},
	TO_PODIUM: {
		name: "Top finish",
		category: "TOURNAMENTS",
		audience: ["FRIENDS", "FOLLOWING", "TEAM"],
		baseScore: 0.7,
		halfLifeHours: 36,
		maxCount: 4,
	},
	TO_DIGEST: {
		name: "Weekend results digest",
		category: "TOURNAMENTS",
		audience: ["FRIENDS"],
		baseScore: 0.55,
		halfLifeHours: 48,
	},
	TO_REGISTERED: {
		name: "Registered for a tournament",
		category: "TOURNAMENTS",
		audience: ["FRIENDS", "TEAM"],
		baseScore: 0.5,
		halfLifeHours: 48,
		maxCount: 3,
	},
	TO_UPSET: {
		name: "Upset alert",
		category: "TOURNAMENTS",
		audience: ["FRIENDS", "TEAM"],
		baseScore: 0.5,
		halfLifeHours: 12,
	},
	TO_LFG: {
		name: "Team needs a player",
		category: "TOURNAMENTS",
		audience: ["EVERYONE"],
		baseScore: 0.4,
		halfLifeHours: 12,
		isNotice: true,
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
		audience: ["SELF"],
		baseScore: 0.35,
		halfLifeHours: 96,
	},
	TO_VOD: {
		name: "Tournament VoD",
		category: "TOURNAMENTS",
		audience: ["SELF", "FRIENDS", "TEAM", "FOLLOWING"],
		baseScore: 0.4,
		halfLifeHours: 48,
	},
	TO_BADGE: {
		name: "Badge earned",
		category: "TOURNAMENTS",
		audience: ["FRIENDS", "TEAM"],
		baseScore: 0.45,
		halfLifeHours: 48,
	},
	TO_TROPHY: {
		name: "Trophy earned",
		category: "TOURNAMENTS",
		audience: ["FRIENDS", "TEAM", "FOLLOWING"],
		baseScore: 0.6,
		halfLifeHours: 48,
	},
	TROPHY_NEW: {
		name: "New trophy design",
		category: "TOURNAMENTS",
		audience: ["FRIENDS", "TEAM"],
		baseScore: 0.45,
		halfLifeHours: 72,
	},
	CALENDAR_FRIENDS_SAVED: {
		name: "Friends are interested",
		category: "TOURNAMENTS",
		audience: ["FRIENDS"],
		baseScore: 0.45,
		halfLifeHours: 48,
	},
	TO_SHOWCASE: {
		name: "Upcoming tournaments",
		category: "TOURNAMENTS",
		audience: ["EVERYONE"],
		baseScore: 0.6,
		halfLifeHours: 48,
		isNotice: true,
	},
	TO_RESULT_FEATURED: {
		name: "Big tournament result",
		category: "TOURNAMENTS",
		audience: ["EVERYONE"],
		baseScore: 0.55,
		halfLifeHours: 36,
	},
	TO_BRACKET_PREVIEW: {
		name: "Registration closed",
		category: "TOURNAMENTS",
		audience: ["SELF", "FRIENDS", "TEAM", "EVERYONE"],
		baseScore: 0.55,
		halfLifeHours: 12,
	},
	ON_THIS_DAY: {
		name: "On this day",
		category: "TOURNAMENTS",
		audience: ["EVERYONE"],
		baseScore: 0.2,
		halfLifeHours: 12,
	},
	TO_LUTI_REGISTRATION: {
		name: "LUTI registration open",
		category: "TOURNAMENTS",
		audience: ["EVERYONE"],
		baseScore: 0.9,
		halfLifeHours: 168,
		isPinned: true,
		isNotice: true,
	},
	TO_STAFF: {
		name: "Organizing a tournament",
		category: "TOURNAMENTS",
		audience: ["FRIENDS", "TEAM"],
		baseScore: 0.3,
		halfLifeHours: 72,
	},
	TEAM_JOIN: {
		name: "Joined a team",
		category: "TEAMS",
		audience: ["FRIENDS", "TEAM"],
		baseScore: 0.5,
		halfLifeHours: 48,
		maxCount: 2,
	},
	TEAM_NEW: {
		name: "New team",
		category: "TEAMS",
		audience: ["FOLLOWING", "FRIENDS", "TEAM"],
		baseScore: 0.35,
		halfLifeHours: 72,
	},
	TEAM_ANNIVERSARY: {
		name: "Team anniversary",
		category: "TEAMS",
		audience: ["TEAM", "FRIENDS"],
		baseScore: 0.4,
		halfLifeHours: 24,
	},
	TEAM_AVAILABILITY: {
		name: "Best time to play",
		category: "TEAMS",
		audience: ["TEAM"],
		baseScore: 0.6,
		halfLifeHours: 48,
	},
	TEAM_EVENT_ADDED: {
		name: "Team event added",
		category: "TEAMS",
		audience: ["TEAM"],
		baseScore: 0.55,
		halfLifeHours: 24,
	},
	SCRIM_POST: {
		name: "Scrim request match",
		category: "SCRIMS",
		audience: ["TEAM"],
		baseScore: 0.45,
		halfLifeHours: 6,
		isNotice: true,
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
		category: "LFG",
		audience: ["LFG"],
		baseScore: 0.35,
		halfLifeHours: 24,
		isNotice: true,
	},
	LFG_TEAM: {
		name: "Team recruiting",
		category: "LFG",
		audience: ["LFG"],
		baseScore: 0.35,
		halfLifeHours: 24,
		isNotice: true,
	},
	ART_NEW: {
		name: "New art",
		category: "ART",
		audience: ["FRIENDS", "TEAM", "FOLLOWING"],
		baseScore: 0.6,
		halfLifeHours: 48,
	},
	ART_TAGGED: {
		name: "Tagged in art",
		category: "ART",
		audience: ["SELF", "FRIENDS", "TEAM"],
		baseScore: 0.55,
		halfLifeHours: 48,
	},
	ART_COMMISSIONS: {
		name: "Commissions open",
		category: "ART",
		audience: ["FRIENDS", "TEAM", "FOLLOWING"],
		baseScore: 0.5,
		halfLifeHours: 72,
	},
	BUILD_NEW: {
		name: "New build",
		category: "BUILDS",
		audience: ["FRIENDS", "TEAM", "FOLLOWING"],
		baseScore: 0.3,
		halfLifeHours: 48,
		maxCount: 2,
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
		audience: ["FRIENDS", "TEAM", "FOLLOWING"],
		baseScore: 0.65,
		halfLifeHours: 72,
	},
	SCANNER_SCORECARD: {
		name: "Scanned match scorecard",
		category: "VODS",
		feature: { label: "Scanner", navIcon: "scanner" },
		audience: ["FRIENDS", "TEAM"],
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

	COMEBACK: {
		name: "Back after a break",
		category: "COMMUNITY",
		audience: ["FRIENDS", "TEAM"],
		baseScore: 0.5,
		halfLifeHours: 48,
		maxCount: 2,
	},
	FIRST_TIME: {
		name: "First time",
		category: "COMMUNITY",
		audience: ["FRIENDS", "TEAM"],
		baseScore: 0.45,
		halfLifeHours: 48,
		maxCount: 2,
	},
	PLUS_RESULTS: {
		name: "New Plus Server tier",
		category: "COMMUNITY",
		feature: { label: "Plus Server", navIcon: "plus" },
		audience: ["FRIENDS", "TEAM"],
		baseScore: 0.5,
		halfLifeHours: 72,
	},
	PLUS_SUGGESTION: {
		name: "New Plus Server suggestion",
		category: "COMMUNITY",
		feature: { label: "Plus Server", navIcon: "plus" },
		audience: ["SELF"],
		baseScore: 0.4,
		halfLifeHours: 48,
	},
	ARTICLE_NEW: {
		name: "New article",
		category: "COMMUNITY",
		feature: { label: "Articles", navIcon: "articles" },
		audience: ["EVERYONE"],
		baseScore: 0.4,
		halfLifeHours: 96,
	},
	ANNOUNCEMENT: {
		name: "Announcement",
		category: "COMMUNITY",
		audience: ["EVERYONE"],
		baseScore: 0.9,
		halfLifeHours: 168,
		isPinned: true,
		isNotice: true,
	},
	SITE_MILESTONE: {
		name: "sendou.ink milestone",
		category: "COMMUNITY",
		audience: ["EVERYONE"],
		baseScore: 0.4,
		halfLifeHours: 48,
	},
	FEATURE_SPOTLIGHT: {
		name: "Feature spotlight",
		category: "COMMUNITY",
		audience: ["EVERYONE"],
		baseScore: 0.25,
		halfLifeHours: 72,
		isNotice: true,
	},
	INSTALL_APP: {
		name: "Install the app",
		category: "COMMUNITY",
		audience: ["SELF"],
		baseScore: 0.2,
		halfLifeHours: 72,
		isHiddenInPwa: true,
		isNotice: true,
	},
	// xxx: ONBOARDING, a pinned checklist for new users (set weapon pool, add 3 friends, play a first set or tournament) that also fills an empty feed
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
		isNotice: true,
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

export const FEED_FEEDBACK_KINDS = [
	"NOT_INTERESTING",
	"TOO_OFTEN",
	"MORE_LIKE_THIS",
	"WRONG",
] as const;

export type FeedFeedbackKind = (typeof FEED_FEEDBACK_KINDS)[number];

export const FEED_FEEDBACK_COMMENT_MAX_LENGTH = 1000;

/** An item stops showing once it's this many half-lives of its type old */
export const FEED_MAX_AGE_HALF_LIVES = 5;

/** Diversity pass: penalty when one of the previous two items shares the category */
export const FEED_SAME_CATEGORY_PENALTY = 0.8;
/** Diversity pass: penalty when the same actor appeared in the previous four items */
export const FEED_SAME_ACTOR_PENALTY = 0.6;
/** Diversity pass: penalty for each item of the same type already picked */
export const FEED_SAME_TYPE_REPEAT_PENALTY = 0.75;

/** Weeks of match history used to find the hours a user usually plays */
export const FEED_ROTATION_LOOKBACK_WEEKS = 8;
/** An hour of the week is a usual play hour once it has matches on this many different weeks */
export const FEED_ROTATION_MIN_WEEKS = 2;

/** Rotations listed in one post, the rest are summed up as a count */
export const FEED_ROTATION_MAX_LISTED = 4;

/** A won set is an upset when the opponents' tier was at least this many steps higher (plus tiers count as a step) */
export const FEED_SQ_UPSET_MIN_TIER_STEPS = 2;

/** Share of an LFG match that comes from the timezone, the rest comes from skill */
export const FEED_LFG_TIMEZONE_WEIGHT = 0.75;
/** Hours between two LFG posts' timezones that still count as the same */
export const FEED_LFG_FULL_MATCH_HOURS = 1;
/** Hours between two LFG posts' timezones at which the timezone no longer matches at all */
export const FEED_LFG_NO_MATCH_HOURS = 7;
/** Tier steps (plus tiers count as a step) between two LFG posts at which the skill no longer matches at all */
export const FEED_LFG_NO_MATCH_TIER_STEPS = 6;
/** Match an LFG post needs to be shown */
export const FEED_LFG_MIN_MATCH = 0.5;

/** Days of accepted scrims a team's usual opponents and scrim hours are taken from */
export const FEED_SCRIM_HISTORY_DAYS = 90;
/** Accepted scrims against a team within `FEED_SCRIM_HISTORY_DAYS` before it's a usual opponent */
export const FEED_SCRIM_USUAL_OPPONENT_MIN_SCRIMS = 2;
/** Divisions a team can be outside of a scrim post's range and still fit it */
export const FEED_SCRIM_FIT_MAX_DIV_GAP = 1;
/** Hours a "looking now" scrim post stays open after it's made, as on the scrims page */
export const FEED_SCRIM_LOOKING_NOW_HOURS = 3;

/** Sets against the same opponent this season before it can be a rivalry */
export const FEED_RIVALRY_MIN_SETS = 4;

/** A bracket win is an upset when the winner was seeded at least this many places lower */
export const FEED_TOURNAMENT_UPSET_MIN_SEED_GAP = 5;

export const SQ_SET_MILESTONES = [100, 250, 500, 1000, 1500, 2000];

/** Days before a SendouQ season starts that its countdown post goes up */
export const FEED_SEASON_COUNTDOWN_DAYS = 3;

/** Days before a SendouQ season ends that the viewer is reminded of a goal they're close to */
export const FEED_SEASON_ENDING_DAYS = 3;
/** Most SP the viewer can be short of the next tier for it to be shown as a goal */
export const FEED_SEASON_ENDING_MAX_SP_SHORT = 30;

/** Friends who saved the same upcoming tournament for its post to get full weight, fewer scale it down */
export const FEED_FRIENDS_SAVED_FULL_WEIGHT = 3;

/** Suggested players listed in one Plus Server suggestion post */
export const FEED_PLUS_SUGGESTIONS_LISTED = 5;

/** UTC hour the scheduled posts (showcase, leaderboard, spotlight) go up */
export const FEED_SCHEDULED_POST_HOUR_UTC = 8;

/** Players & teams listed in the weekly leaderboard post */
export const FEED_LEADERBOARD_TOP_COUNT = 5;

/** A finished tournament is big enough to show to everyone at this tier (S) or better... */
export const FEED_FEATURED_RESULT_MAX_TIER = 3;
/** ...or with this many teams */
export const FEED_FEATURED_RESULT_MIN_TEAMS = 48;

/** Strongest teams listed when a tournament's registration closes, besides the viewer's and friends' */
export const FEED_BRACKET_PREVIEW_TOP_TEAMS = 4;

/** Days without SendouQ sets or tournaments before playing again counts as a comeback */
export const FEED_COMEBACK_MIN_BREAK_DAYS = 90;

/** Days a feed event of the type is kept, the window its feed item looks back */
export const FEED_EVENT_RETENTION_DAYS = {
	COMEBACK: 30,
	FIRST_TIME: 30,
	SQ_MILESTONE: 60,
	SQ_STREAK: 30,
	SQ_PROMOTION: 60,
	SQ_UPSET: 10,
	SQ_RIVALRY: 60,
	TO_RESULT: 14,
} satisfies Record<FeedEventType, number>;

/** Days of the feed event type kept the longest */
export const FEED_EVENT_MAX_RETENTION_DAYS = Math.max(
	...Object.values(FEED_EVENT_RETENTION_DAYS),
);

/** Smallest site total that counts as a milestone, after it every 1, 2 and 5 times a power of ten does */
export const FEED_SITE_MILESTONE_MIN = 1000;

export interface FeedAnnouncement {
	title: string;
	text: string;
	href: string;
	navIcon: NavIcon;
	/** ISO date */
	startsAt: string;
	/** ISO date */
	endsAt: string;
}

// xxx: let the site admin set the announcement on the site (e.g. the admin page) instead of editing this list
/** Announcements pinned to the top of everyone's feed while they're active */
export const FEED_ANNOUNCEMENTS: FeedAnnouncement[] = [];

/** Shown on the test page when no announcement is active */
export const FEED_MOCK_ANNOUNCEMENT: Omit<
	FeedAnnouncement,
	"startsAt" | "endsAt"
> = {
	title: "Ver. 11.0.0 balance changes are in",
	text: "Weapon stats of the new patch are now in the build analyzer.",
	href: "/analyzer",
	navIcon: "analyzer",
};

/** Shown on the test page when LUTI registration isn't open */
export const FEED_MOCK_LUTI_SEASON = "17";

export interface FeedSpotlight {
	title: string;
	text: string;
	href: string;
	navIcon: NavIcon;
}

/** Features and lesser known parts of them, one shown each week */
export const FEED_SPOTLIGHTS: FeedSpotlight[] = [
	{
		title: "Timestamps for your VoD's YouTube description",
		text: "Every VoD page has a button that copies its matches as timestamps with weapons, modes and stages. Paste them into the YouTube description and they become chapters.",
		href: "/vods",
		navIcon: "vods",
	},
	{
		title: "Tournaments in your own calendar",
		text: "The iCal link on the calendar page adds sendou.ink events to Google Calendar, Apple Calendar or Outlook, with the filters you've picked.",
		href: "/calendar",
		navIcon: "calendar",
	},
	{
		title: "What everyone runs on your weapon",
		text: "Every weapon's builds page has popular builds and ability stats, worked out from all the builds people have shared.",
		href: "/builds",
		navIcon: "builds",
	},
	{
		title: "Plan your team's strategies",
		text: "Draw plans on top of any stage and mode with weapon and object icons.",
		href: "/plans",
		navIcon: "plans",
	},
	{
		title: "How many shots does it take?",
		text: "The object damage calculator shows how many hits each weapon needs to destroy objects like Sprinklers and Splash Walls.",
		href: "/object-damage-calculator",
		navIcon: "object-damage-calculator",
	},
	{
		title: "Build analyzer",
		text: "See what each ability in your build does to ink usage, speeds, special charge and more, and compare two builds side by side.",
		href: "/analyzer",
		navIcon: "analyzer",
	},
	{
		title: "Check your team comp",
		text: "Pick four weapons and see their ranges, damage combos and specials side by side.",
		href: "/comp-analyzer",
		navIcon: "comp-analyzer",
	},
	{
		title: "Scan your matches",
		text: "Point the scanner at your capture card or a VoD file and it reads the weapons, stages, modes and results of your matches.",
		href: "/scanner",
		navIcon: "scanner",
	},
	{
		title: "Tier lists",
		text: "Make a tier list of weapons, stages, specials and more, and download it as an image.",
		href: "/tier-list-maker",
		navIcon: "tier-list-maker",
	},
	{
		title: "Scrim with your circle",
		text: "Associations let a group of teams share scrim requests only with each other.",
		href: "/associations",
		navIcon: "associations",
	},
];

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
