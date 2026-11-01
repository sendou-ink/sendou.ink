import type { NavIcon } from "~/utils/urls";
import type { FeedAudience, FeedItemType } from "./feed-constants";

export type FeedSourceAudience = FeedAudience | "ASSOCIATION" | "PLUS_TIER";

export type FeedSourcePlacement = "FEED" | "PINNED" | "LIVE";

/** Item type that isn't in the prototype yet */
export interface ProposedFeedItem {
	key: string;
	name: string;
	audience: FeedSourceAudience[];
	placement: FeedSourcePlacement;
}

export interface FeedSource {
	item: FeedItemType | ProposedFeedItem;
	when: string;
	/** Button on the post itself, e.g. "Add friend" */
	action?: string;
	/** Example post, `**` marks bold */
	example: { actor: string; text: string };
}

/** How the feature's items are picked for a viewer */
export interface FeedSourceAlgorithm {
	/** Checked before anything is scored */
	gate: string;
	signals: Array<{ name: string; measure: string; scoring: string }>;
	decision: string;
	workedExample?: string;
	openQuestions?: string[];
}

export interface FeedSourceFeature {
	name: string;
	navIcon?: NavIcon;
	note?: string;
	algorithm?: FeedSourceAlgorithm;
	sources: FeedSource[];
}

/** Every sendou.ink feature and the feed items it could create */
export const FEED_SOURCE_FEATURES: FeedSourceFeature[] = [
	{
		name: "SendouQ",
		navIcon: "sendouq",
		note: "The biggest source of activity. Most items are about friends, so the volume scales with the size of your friend list.",
		sources: [
			{
				item: "SQ_SET",
				when: "Only sets with a story, never every set. Either a friend ranked up and the new tier is at least their tier last season (getting back to Gold isn't news for someone who's usually Leviathan), or they won against a team at least 2 tiers higher (an upset). Tier promotions are part of this item, not a separate one.",
				example: {
					actor: "Callie",
					text: "**Callie** ranked up to **Diamond+** after a SendouQ set win · 4–2",
				},
			},
			{
				item: "SQ_STREAK",
				when: "A friend wins 5 sets in a row. Updated in place while the streak continues.",
				example: {
					actor: "Pearl",
					text: "**Pearl** is on a **7-set** win streak",
				},
			},
			{
				item: "SQ_LEADERBOARD",
				when: "A friend enters the season top 100 or climbs at least 10 places in a day.",
				example: {
					actor: "Marie",
					text: "**Marie** is **#73** on the season leaderboard",
				},
			},
			{
				item: "SQ_MILESTONE",
				when: "A friend plays their 100th, 250th, 500th or 1000th set.",
				example: {
					actor: "Marina",
					text: "**Marina** played their **500th** SendouQ set",
				},
			},
			{
				item: "SQ_SEASON_RECAP",
				when: "A season ends and it was a new peak for you or a friend: a higher tier than in any earlier season, or their first ranked season.",
				example: {
					actor: "Pearl",
					text: "**Pearl**'s Season 12 recap · #62 of 2070 · Leviathan",
				},
			},
			{
				item: "SQ_RIVALRY",
				when: "You or a friend has played the same opponent 4+ times this season and it's close: the set gap is at most 1, or a fifth of the sets played. One-sided matchups aren't rivalries.",
				example: {
					actor: "Callie",
					text: "**Callie** keeps running into **Frye** · 5–4 in sets",
				},
			},
			{
				item: {
					key: "SQ_SEASON_ENDING",
					name: "Season ending soon",
					audience: ["SELF"],
					placement: "PINNED",
				},
				when: "3 days before a season ends, if you're close to a goal: sets short of getting a rank, or SP from the next tier.",
				example: {
					actor: "SendouQ",
					text: "Season 13 ends in **3 days** · 2 more sets to get ranked",
				},
			},
			{
				item: {
					key: "SQ_MAP_INSIGHT",
					name: "Map insight",
					audience: ["SELF"],
					placement: "FEED",
				},
				when: "Weekly, from your own map results (the match profile): your best and worst map and mode lately.",
				example: {
					actor: "SendouQ",
					text: "Your best map this month: **Hammerhead Bridge Rainmaker** · 9–2",
				},
			},
		],
	},
	{
		name: "Lobbies",
		navIcon: "lobbies",
		sources: [
			{
				item: {
					key: "LOBBY_UPCOMING",
					name: "Upcoming lobby",
					audience: ["FRIENDS", "ASSOCIATION"],
					placement: "FEED",
				},
				when: "A friend or one of your associations schedules a lobby for later. Shown until it starts or fills up. Friends signed up for a lobby that's about to start are in the sidebar instead.",
				action: "Sign up",
				example: {
					actor: "Marina",
					text: "**Marina** scheduled **Sunday 8s** · Sun 19:00 · 3/8 signed up",
				},
			},
			{
				item: "LOBBY_RECAP",
				when: "A lobby you or friends played in ends: number of sets and the top players.",
				example: {
					actor: "Lobby",
					text: "**Friday 8s** wrapped up · 9 sets, 14 players · Callie took 1st",
				},
			},
		],
	},
	{
		name: "Tournaments",
		navIcon: "medal",
		note: "Results, registrations and VoDs. Tournament subs and the tournament LFG are covered here too.",
		sources: [
			{
				item: "TO_WIN",
				when: "Results are finalized and a friend's team placed 1st.",
				example: {
					actor: "Shiver",
					text: "**Shiver** won **Stellaris Phantasm #34** with Squid Sisters",
				},
			},
			{
				item: "TO_PODIUM",
				when: "Results are finalized and a friend placed 2nd–3rd, or in the top 10% of a large tournament.",
				example: {
					actor: "Big Man",
					text: "**Big Man** placed **3rd** of 24 at Milkcup Birthday Bash",
				},
			},
			{
				item: "TO_DIGEST",
				when: "Monday morning, all of your friends' results from the weekend in one post instead of one post each.",
				example: {
					actor: "Weekend",
					text: "**6 friends** played 4 tournaments this weekend",
				},
			},
			{
				item: "TO_UPSET",
				when: "A friend's team is in an upset: it beats a team seeded at least 5 places higher, or a team seeded at least 5 places lower beats it. The post says which friend, so it's clear why it's in your feed.",
				example: {
					actor: "Callie",
					text: "**Callie**'s team, seeded 10, knocked out seed 1 at **In The Zone 55**",
				},
			},
			{
				item: "TO_REGISTERED",
				when: "A friend registers for an upcoming tournament.",
				example: {
					actor: "Marina",
					text: "**Marina** registered for **SuperJump 8** · 32 teams in",
				},
			},
			{
				item: "TO_LFG",
				when: "A team in the tournament LFG for an upcoming tournament is a player short, matched to your weapons and level. Shows the team's own message if they wrote one, since there's no way to know which role they need.",
				action: "Show interest",
				example: {
					actor: "Fresh Season",
					text: '**Fresh Season** is looking for a player for **7 Seas #11** \u00b7 "Looking for a backline, DM on Discord"',
				},
			},
			{
				item: {
					key: "TO_SUBS",
					name: "Subs available",
					audience: ["TEAM"],
					placement: "FEED",
				},
				when: "Players sign up to the sub list of a tournament your team is registered in, and your team is looking for players too (short of a full roster, or has a tournament LFG post). Shown to the team captain.",
				example: {
					actor: "Subs",
					text: "**4 subs** signed up for In The Zone 55 \u00b7 your team is a player short",
				},
			},
			{
				item: "TO_STAFF",
				when: "A friend is added as staff (TO or caster) to an upcoming tournament.",
				example: {
					actor: "Annie",
					text: "**Annie** is organizing **LAN of 10,000 Lakes #5**",
				},
			},
			{
				item: "TO_VOD",
				when: "A VoD gets linked to a tournament match a friend played or that was on stream.",
				example: {
					actor: "Spyke",
					text: "**Spyke** added a VoD from **Baja's Blast #72**",
				},
			},
			{
				item: {
					key: "TO_BRACKET_PROGRESSION",
					name: "Reached a higher bracket",
					audience: ["FRIENDS", "TEAM"],
					placement: "FEED",
				},
				when: "A friend's team makes it into a higher bracket than it usually does, e.g. Great White in Swim or Sink. Usual = the bracket the team (or most of its players) reached most often in the series' earlier events. Not shown when that's where they always end up.",
				example: {
					actor: "Callie",
					text: "**Callie**'s team made **Great White** at Swim or Sink #40 \u00b7 usually in Hammerhead",
				},
			},
		],
	},
	{
		name: "Tournament organizations",
		navIcon: "medal",
		note: "Following an org could also happen automatically, e.g. when you play their events regularly, so these reach the players who'd want them without a follow button.",
		sources: [
			{
				item: "TO_ORG_NEW",
				when: "An org you follow announces a tournament.",
				example: {
					actor: "Ink Café",
					text: "**Ink Café** announced **Milkcup #26** · registration open",
				},
			},
			{
				item: "TO_SERIES",
				when: "After each event in a series with a leaderboard, if you or friends are on it.",
				example: {
					actor: "Triton",
					text: "**Triton-Cup** standings, last 90 days · Marie is #39",
				},
			},
			{
				item: {
					key: "ORG_ANNOUNCEMENT",
					name: "Org announcement",
					audience: ["FOLLOWING"],
					placement: "FEED",
				},
				when: "An org you follow posts an announcement, e.g. a new season, a rule change or a break.",
				example: {
					actor: "Ink Caf\u00e9",
					text: "**Ink Caf\u00e9**: Milkcup goes biweekly from December",
				},
			},
			{
				item: {
					key: "TO_SERIES_UPCOMING",
					name: "Next event in your series",
					audience: ["SELF"],
					placement: "FEED",
				},
				when: "An event is announced in a series you typically play (3 or more of its last 6 events).",
				action: "Register",
				example: {
					actor: "Triton",
					text: "**Triton-Cup 172** is open for registration \u00b7 you played 5 of the last 6",
				},
			},
		],
	},
	{
		name: "Calendar",
		navIcon: "calendar",
		sources: [
			{
				item: "CALENDAR_EVENT_NEW",
				when: "An event with tags you care about (LAN, art, your region) is added to the calendar.",
				action: "Save",
				example: {
					actor: "Annie",
					text: "**LAN of 10,000 Lakes #5** was added to the calendar · Nov 21",
				},
			},
			{
				item: {
					key: "CALENDAR_SAVED_SOON",
					name: "Saved event starts soon",
					audience: ["SELF"],
					placement: "PINNED",
				},
				when: "An event you saved starts within 24 hours.",
				example: {
					actor: "Calendar",
					text: "**Milkcup #26** starts tomorrow at 19:00 · you saved this",
				},
			},
			{
				item: {
					key: "CALENDAR_FRIENDS_SAVED",
					name: "Friends are interested",
					audience: ["FRIENDS"],
					placement: "FEED",
				},
				when: "3 or more friends saved the same upcoming event.",
				example: {
					actor: "Calendar",
					text: "**3 friends** saved **Milkcup #26**",
				},
			},
			{
				item: {
					key: "CALENDAR_LAN_NEARBY",
					name: "LAN near you",
					audience: ["SELF"],
					placement: "FEED",
				},
				when: "Future: a LAN is added close to you. Needs a location or region on your profile.",
				action: "Save",
				example: {
					actor: "Calendar",
					text: "**LAN of 10,000 Lakes #5** was added \u00b7 40 km from you",
				},
			},
		],
	},
	{
		name: "Badges & trophies",
		navIcon: "badges",
		sources: [
			{
				item: "TO_BADGE",
				when: "A friend gets a badge, usually from winning a tournament that awards one.",
				example: {
					actor: "Shiver",
					text: "**Shiver** earned the **Stellaris Phantasm** badge · 133 players own it",
				},
			},
			{
				item: "TO_TROPHY",
				when: "A trophy is approved for a friend.",
				example: {
					actor: "Acht",
					text: "**Acht** earned the **Triton-Cup Season 4** trophy",
				},
			},
			{
				item: {
					key: "TROPHY_NEW",
					name: "New trophy design",
					audience: ["FRIENDS", "FOLLOWING"],
					placement: "FEED",
				},
				when: "A trophy made by a friend or an artist you follow is uploaded (the trophy's creator).",
				example: {
					actor: "Moe",
					text: "**Moe** made the **Triton-Cup Season 5** trophy",
				},
			},
		],
	},
	{
		name: "Teams",
		navIcon: "t",
		sources: [
			{
				item: "TEAM_JOIN",
				when: "A friend joins a team, or someone joins your team.",
				example: {
					actor: "Pearl",
					text: "**Pearl** joined **Splash Mob** · 7 members",
				},
			},
			{
				item: "TEAM_NEW",
				when: "A friend creates a team.",
				example: { actor: "Murch", text: "**Murch** created **Moray Towers**" },
			},
			{
				item: {
					key: "TEAM_RESULT",
					name: "Team result",
					audience: ["FOLLOWING"],
					placement: "FEED",
				},
				when: "A team you follow places in a tournament, even when none of your friends are on it.",
				example: {
					actor: "Deepsea",
					text: "**Deepsea** placed **2nd** at Triton-Cup 170",
				},
			},
		],
	},
	{
		name: "Team availability & events",
		navIcon: "t",
		sources: [
			{
				item: "TEAM_AVAILABILITY",
				when: "Enough of your team has filled in availability for the week to find a shared window.",
				example: {
					actor: "Kraken",
					text: "**4 of 5** on Kraken Kids are free together · Fri 21:00",
				},
			},
			{
				item: {
					key: "TEAM_EVENT_ADDED",
					name: "Team event added",
					audience: ["TEAM"],
					placement: "FEED",
				},
				when: "A teammate adds a team event, e.g. a VoD review or a scrim block. You also get a notification; the feed post is the team's shared record of it.",
				example: {
					actor: "Inkopolis Ink",
					text: "**Marie** added **VoD review** to Inkopolis Ink \u00b7 Thu 20:00",
				},
			},
		],
	},
	{
		name: "Scrims",
		navIcon: "scrims",
		note: "Associations don't create items of their own. They are used here as an audience: a scrim posted to an association is only shown to its members.",
		algorithm: {
			gate: "Only for members of a team. Open scrim posts only: a post leaves the feed as soon as a request on it is accepted, and when its start time passes.",
			signals: [
				{
					name: "Usual opponents",
					measure:
						"Teams yours has scrimmed at least twice in the last 3 months, from reported scrims.",
					scoring: "A new post by one of them is always shown.",
				},
				{
					name: "Association",
					measure: "Posts shared to an association you're in.",
					scoring: "Shown, ranked below usual opponents.",
				},
				{
					name: "Fit",
					measure:
						"Posts by anyone else, against your team's division and the hours you usually scrim.",
					scoring:
						"Shown only within 1 division and in hours your team has scrimmed before.",
				},
			],
			decision:
				"Usual opponents first, then association posts, then other posts that fit. A post you've requested stays until it's accepted or declined.",
		},
		sources: [
			{
				item: "SCRIM_POST",
				when: "A team you usually scrim against, someone in your association, or a team that fits your division and times posts a scrim (see above). Removed once accepted.",
				action: "Request scrim",
				example: {
					actor: "Lucky Splat",
					text: "**Lucky Splat** is looking for a scrim · Mon 02:00 · Div 6–7",
				},
			},
			{
				item: "SCRIM_RESULT",
				when: "Your team reports the maps of a scrim. Only which maps were played, no score: scrims are practice.",
				example: {
					actor: "Wahoo Crew",
					text: "**Wahoo Crew** scrimmed **Eeltail** \u00b7 Splat Zones, Tower Control and Rainmaker",
				},
			},
		],
	},
	{
		name: "LFG",
		navIcon: "lfg",
		algorithm: {
			gate: "Only if you have an LFG post of your own that's under 30 days old, the same window the LFG page shows. You only see posts that answer yours: looking for a team gets teams recruiting, recruiting gets players looking, coaching posts get players or teams looking for a coach (and the other way around), scrim posts get other scrim posts. Posts limited to a Plus tier follow the LFG page's rule, and your own team's posts are skipped. If the posts both list languages, they need one in common.",
			signals: [
				{
					name: "Weapons",
					measure:
						"Your weapon pool against the post author's, both from the match profile. A team post uses the combined pool of its members.",
					scoring:
						"Shared weapons ÷ the smaller pool, from 0 to 1. Favorite and 10★ weapons count twice. If either pool is empty, 0.5.",
				},
				{
					name: "Timezone",
					measure:
						"Hours between your post's timezone and theirs, with the LFG page's helper (follows daylight saving and wraps around the date line, so it's never more than 12).",
					scoring: "0–2 h: 1 · 3–4 h: 0.6 · 5–6 h: 0.3 · 7 h or more: hidden.",
				},
				{
					name: "Skill",
					measure:
						"Steps between accurate SendouQ tiers from this or last season (the same tiers the LFG page's tier filter uses). Each plus tier is its own step, e.g. Diamond+ → Diamond → Platinum+. A team post uses its median member.",
					scoring:
						"0–1 steps: 1 · 2 steps: 0.6 · 3 steps: 0.3 · 4 or more: hidden. No accurate tier on either side: 0.5. Coach posts skip this signal.",
				},
			],
			decision:
				"Hidden if the timezone or skill gap hits its cutoff. Otherwise match = 0.4 × timezone + 0.35 × skill + 0.25 × weapons, and the post is shown when the match is at least 0.6. The match takes the place of audience affinity in the ranking score, so the best fits rise first. At most 2 LFG posts a day, and a post you've already seen comes back only after it's bumped.",
			workedExample:
				"You're looking for a team: Europe/Helsinki, Diamond+, pool Splattershot, Splattershot Jr., Sploosh-o-matic. Deepsea is recruiting: Europe/London (2 h → 1), median member Platinum+ (2 steps → 0.6), combined pool shares Splattershot Jr. (1 of 3 → 0.33). Match = 0.4 + 0.21 + 0.08 = 0.69, so the post is shown.",
			openQuestions: [
				"For players and teams, should weapons reward overlap or the role the team is missing? Team posts don't say which weapons they want, so overlap is used for now.",
			],
		},
		sources: [
			{
				item: "LFG_PLAYER",
				when: "Your team has a recruiting post and a player posts that they're looking for a team. Shown if they match (see above).",
				example: {
					actor: "Craymond",
					text: "**Craymond** is looking for a team · D4+ · Europe/London",
				},
			},
			{
				item: "LFG_TEAM",
				when: "You have a post looking for a team and a team posts that it's recruiting. Shown if they match (see above).",
				example: {
					actor: "Deepsea",
					text: "**Deepsea** is recruiting a support shooter · America/Chicago",
				},
			},
			{
				item: {
					key: "LFG_COACH",
					name: "Coaching posts",
					audience: ["LFG"],
					placement: "FEED",
				},
				when: "You have a post looking for a coach and a coach posts, or the other way around. Shown if they match (see above).",
				example: {
					actor: "Mr. Grizz",
					text: "**Mr. Grizz** is offering coaching for Div 3–5 teams",
				},
			},
		],
	},
	{
		name: "Art",
		navIcon: "art",
		sources: [
			{
				item: "ART_NEW",
				when: "An artist you follow posts art.",
				example: { actor: "Moe", text: "**Moe** posted new art · 3 pieces" },
			},
			{
				item: "ART_TAGGED",
				when: "Art is posted with a friend tagged in it. You get a notification when you're tagged yourself.",
				example: {
					actor: "Harmony",
					text: "**Harmony** tagged **Spyke** in art",
				},
			},
			{
				item: "ART_COMMISSIONS",
				when: "An artist you follow opens commissions.",
				example: { actor: "Moe", text: "**Moe** opened commissions" },
			},
		],
	},
	{
		name: "Builds",
		navIcon: "builds",
		note: "Builds with a description rank higher than ones without. Build stats and the build analyzer are tools you use yourself and don't post anything.",
		sources: [
			{
				item: "BUILD_NEW",
				when: "A friend or followed player posts a build.",
				example: {
					actor: "Agent 4",
					text: "**Agent 4** posted a Tri-Stringer build",
				},
			},
			{
				item: "BUILD_FOR_YOU",
				when: "A top player (high X Power) posts a build for a weapon in your weapon pool.",
				example: {
					actor: "Agent 4",
					text: "**Agent 4** (3219 XP) posted a build for a weapon you play",
				},
			},
			{
				item: {
					key: "ABILITY_TRENDS",
					name: "Ability trends",
					audience: ["SELF"],
					placement: "FEED",
				},
				when: "Weekly, from new builds: an ability combination that's showing up a lot more in recent builds for a weapon in your pool.",
				example: {
					actor: "Builds",
					text: "**Comeback + Stealth Jump** is trending on **Tri-Stringer** \u00b7 in 34% of new builds, up from 12%",
				},
			},
		],
	},
	{
		name: "VoDs",
		navIcon: "vods",
		sources: [
			{
				item: "VOD_NEW",
				when: "A VoD is added with a friend or a followed player in it, or one on your weapon.",
				example: {
					actor: "VoD",
					text: "**Grand Finals** VoD · 7 games · Callie on Splattershot",
				},
			},
		],
	},
	{
		name: "X Rank leaderboards",
		navIcon: "xsearch",
		sources: [
			{
				item: "XRANK_TOP_500",
				when: "Monthly results are imported and a friend or followed player made the Top 500.",
				example: {
					actor: "Jelonzo",
					text: "**Jelonzo** placed **#2** in X Rank · Takoroka",
				},
			},
			{
				item: {
					key: "XRANK_RESULTS_IN",
					name: "New month's results",
					audience: ["EVERYONE"],
					placement: "FEED",
				},
				when: "A new month of Top 500 results is imported.",
				example: {
					actor: "X Rank",
					text: "**October X Rank results** are in · 12 friends placed",
				},
			},
		],
	},
	{
		name: "Scanner",
		navIcon: "scanner",
		note: "Anything personal from scanned matches needs an opt out, since players may not want their X Power or play sessions shown to friends.",
		sources: [
			{
				item: "SCANNER_SCORECARD",
				when: "A friend scans a match: K/A, deaths, specials and paint for all 8 players.",
				example: {
					actor: "Li'l Judd",
					text: "**Li'l Judd** scanned a match · 8 kills, 4 specials",
				},
			},
			{
				item: {
					key: "SCANNER_SESSION",
					name: "Play session",
					audience: ["FRIENDS"],
					placement: "FEED",
				},
				when: "A friend's scanned play session ends: mode, stages and results. Players can opt out.",
				example: {
					actor: "Callie",
					text: "**Callie** played X Battle Splat Zones on Mahi-Mahi Resort and Museum d'Alfonsino \u00b7 7\u20133",
				},
			},
			{
				item: {
					key: "SCANNER_XP",
					name: "X Power milestone",
					audience: ["FRIENDS"],
					placement: "FEED",
				},
				when: "From scanned matches, a friend's X Power in a mode reaches a new high or crosses a round number (2500, 3000). Players can opt out.",
				example: {
					actor: "Marie",
					text: "**Marie** reached **3000 X Power** in Splat Zones \u00b7 new peak",
				},
			},
			{
				item: {
					key: "SCANNER_CLIP",
					name: "Clip",
					audience: ["FRIENDS", "FOLLOWING"],
					placement: "FEED",
				},
				when: "A friend or someone you follow uploads a clip to show off a play. Scanned clips come with the match they're from: mode, stage and weapons.",
				action: "Watch",
				example: {
					actor: "Callie",
					text: "**Callie** posted a clip · 4-kill Ultra Stamp on Mahi-Mahi Resort, Splat Zones",
				},
			},
		],
	},
	{
		name: "Meta & stats",
		navIcon: "analyzer",
		note: "Numbers about the game as a whole, not about people you know.",
		sources: [
			{
				item: "SQ_META",
				when: "Weekly, from weapons reported in SendouQ: the biggest risers and fallers in share of picks.",
				example: {
					actor: "SendouQ",
					text: "**Weapon trends** this week · Splatana Wiper +49%",
				},
			},
			{
				item: {
					key: "SCANNER_TRENDS",
					name: "Trending in scanned matches",
					audience: ["EVERYONE"],
					placement: "FEED",
				},
				when: "Weekly, from Scanner matches: the main weapon, sub weapon and special weapon whose share of games rose the most against the 4 weeks before. Each needs enough scanned games that week to count.",
				example: {
					actor: "Scanner",
					text: "Trending in scanned matches: **Tri-Stringer** (main) · **Burst Bomb** (sub) · **Ink Vac** (special, in 18% of games, up from 9%)",
				},
			},
		],
	},
	{
		name: "Friends",
		navIcon: "u",
		note: "Friend requests are notifications, not feed items.",
		sources: [
			{
				item: "FRIEND_NEW",
				when: "Two of your friends become friends with each other.",
				example: {
					actor: "Callie",
					text: "**Callie** and **Judd** are now friends",
				},
			},
			{
				item: "FRIEND_SUGGEST",
				when: "You've played a lot of sets with someone who isn't your friend yet.",
				action: "Add friend",
				example: {
					actor: "Agent 8",
					text: "You've played **199 sets** with **Agent 8**",
				},
			},
		],
	},
	{
		name: "Plus Server",
		navIcon: "plus",
		sources: [
			{
				item: "PLUS_RESULTS",
				when: "Voting results are published and a friend made it to a new tier: into the Plus Server for the first time, or up a tier (e.g. +3 to +2). Staying in the same tier isn't news.",
				example: { actor: "Plus Server", text: "**Pearl** made it to **+2**" },
			},
			{
				item: {
					key: "PLUS_SUGGESTION",
					name: "New suggestion",
					audience: ["PLUS_TIER"],
					placement: "FEED",
				},
				when: "Someone is suggested to your tier. Only shown to members of that tier.",
				example: {
					actor: "Plus Server",
					text: "**Mr. Grizz** was suggested to +2",
				},
			},
		],
	},
	{
		name: "User pages",
		navIcon: "u",
		sources: [
			{
				item: "MEMORY",
				when: "The anniversary of your first tournament (or first set, or joining).",
				example: {
					actor: "Memories",
					text: "**3 years ago** you played your first sendou.ink tournament",
				},
			},
			{
				item: {
					key: "WEAPON_POOL",
					name: "Weapon pool change",
					audience: ["FRIENDS"],
					placement: "FEED",
				},
				when: "A friend adds a new weapon to their pool.",
				example: {
					actor: "Callie",
					text: "**Callie** now plays **Splatana Wiper**",
				},
			},
			{
				item: {
					key: "RESULT_HIGHLIGHT",
					name: "Highlighted result",
					audience: ["FRIENDS"],
					placement: "FEED",
				},
				when: "A friend pins a result to their profile.",
				example: {
					actor: "Pearl",
					text: "**Pearl** highlighted **1st at Swim or Sink**",
				},
			},
		],
	},
	{
		name: "Live streams",
		navIcon: "sendouq",
		sources: [
			{
				item: "STREAM_LIVE",
				when: "A friend or followed player goes live on Twitch or YouTube outside of a match. Streams of friends' SendouQ and tournament matches are in the sidebar's Friends section.",
				example: {
					actor: "Agent 3",
					text: "**Agent 3** is live on Twitch · 11 watching",
				},
			},
		],
	},
	{
		name: "Voice",
		sources: [
			{
				item: "VOICE_ROOM",
				when: "2 or more friends are in a voice room you can join.",
				example: {
					actor: "Cap'n Cuttlefish",
					text: "**Cap'n Cuttlefish** and 2 others are in voice",
				},
			},
		],
	},
	{
		name: "Articles",
		navIcon: "articles",
		sources: [
			{
				item: {
					key: "ARTICLE_NEW",
					name: "New article",
					audience: ["EVERYONE"],
					placement: "FEED",
				},
				when: "An article is published. Shown to friends of the author with extra weight.",
				example: {
					actor: "Articles",
					text: "New article: **Waving goodbye: the start of Splatoon's great retirement**",
				},
			},
		],
	},
	{
		name: "Changelog",
		sources: [
			{
				item: "SITE_UPDATE",
				when: "On update day, the changelog entries since the last update.",
				example: {
					actor: "sendou.ink",
					text: "**sendou.ink** update · Voice chat in tournaments, lobbies for everyone",
				},
			},
		],
	},
	{
		name: "Splatoon rotations",
		navIcon: "maps",
		algorithm: {
			gate: "Only upcoming rotations (Anarchy Series, Anarchy Open and X Battle, from splatoon3.ink, about a day ahead), never the one that's on now. You need SendouQ or tournament matches in the last 8 weeks so your usual hours are known, and a map pool in your match profile (or a team practice focus, a future feature).",
			signals: [
				{
					name: "Usual hours",
					measure:
						"Start times of your SendouQ matches and tournament games in the last 8 weeks, grouped by hour of the week. An hour counts once you've played in it on 2 different weeks.",
					scoring:
						"Fits if any hour of the 2-hour rotation is a usual hour, give or take an hour so daylight saving and starting a bit late don't matter.",
				},
				{
					name: "Map pool",
					measure: "Your match profile's map pool for the rotation's mode.",
					scoring:
						"Fits if at least one of the two stages is in it. A mode you've marked Avoid never fits.",
				},
				{
					name: "Practice focus",
					measure:
						"Future feature: the stages and modes your team is practising this week.",
					scoring:
						"Counts the same as your map pool, so a rotation fits if a stage is in either.",
				},
			],
			decision:
				"A rotation is shown only when it fits both your usual hours and your maps. All the fitting rotations go into one post, so there's never a post for every 2-hour change: the next 4 are listed with stages from your pool highlighted, the rest as a count.",
			workedExample:
				"You've played SendouQ on Monday and Thursday evenings, 20:00–23:00, for the last few weeks, and your Splat Zones pool has Hammerhead Bridge. Monday 21:00 X Battle is Splat Zones on Hammerhead Bridge and Mahi-Mahi Resort, so it's shown with Hammerhead Bridge highlighted. Tuesday 21:00 is skipped (not a usual day), and Monday's Rainmaker rotation is skipped because you avoid Rainmaker.",
		},
		sources: [
			{
				item: "ROTATION",
				when: "New rotations are announced, and some fall in your usual hours with a stage from your map pool (see above).",
				example: {
					actor: "Rotation",
					text: "**2 upcoming rotations** in your usual hours with maps from your pool · Mon 21:00 X Battle Splat Zones",
				},
			},
		],
	},
];

/** Features that don't create feed items, and why */
export const FEED_SOURCE_NONE: Array<{ name: string; reason: string }> = [
	{
		name: "What friends are doing right now",
		reason:
			"In the queue, in a SendouQ or tournament match (with its stream or cast), in a lobby or signed up for one. The sidebar's Friends section already shows these.",
	},
	{
		name: "Chat",
		reason:
			"Private conversations, and new messages already have unread counts and notifications.",
	},
	{
		name: "Notifications",
		reason:
			"Things addressed to you go there instead: check-in opening, team events, scrims being scheduled, the availability reminder, Plus voting starting, being tagged in art. The feed doesn't repeat them.",
	},
	{
		name: "Map planner, tier list maker, map list generator, comp analyzer, object damage calculator, build analyzer",
		reason:
			"Tools you use on your own. Nothing is saved on the server, so there's nothing to post.",
	},
	{
		name: "Global status (sidebar indicator)",
		reason:
			"Shows your own current SendouQ, lobby or tournament state. The live strip covers the same states for friends.",
	},
	{
		name: "User card & private notes",
		reason: "Private notes are only for you.",
	},
	{
		name: "Settings, theme, timezone, search, info, links, translations",
		reason: "Account and site settings.",
	},
	{
		name: "Admin, bans, user reports, mod notes",
		reason: "Moderation is not public activity.",
	},
];
