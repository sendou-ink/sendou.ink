import {
	DEV_TEST_ID,
	NZAP_TEST_ID,
	ORG_ADMIN_TEST_ID,
	STAFF_TEST_ID,
} from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import type { Notification } from "~/features/notifications/notifications-types";

/** The dev seed's users whose ids grant them something, offered one click away in the dev toolbar. */
export const QUICK_LOG_IN_USERS = [
	{ id: ADMIN_ID, label: "Admin" },
	{ id: NZAP_TEST_ID, label: "Regular" },
	{ id: ORG_ADMIN_TEST_ID, label: "Org admin" },
	{ id: STAFF_TEST_ID, label: "Staff" },
	{ id: DEV_TEST_ID, label: "Dev" },
] as const;

/** What the dev tools' error page throws: a loader response of that status, or an error while rendering. */
export const DEV_ERROR_KINDS = ["404", "401", "403", "500", "render"] as const;

/** The only database file the dev tools may reseed, the rest (sandbox, snapshot...) hold data a reseed would destroy. */
export const RESEEDABLE_DATABASE_FILE = "db.sqlite3";

const SAMPLE_TOURNAMENT = { tournamentId: 1, tournamentName: "In The Zone 42" };
const SAMPLE_OPPONENT = { opponentTeamName: "Team Olive" };

/** A plausible instance of every notification type, sent by the dev toolbar to check how each renders. Ids may point to nothing. */
export const SAMPLE_NOTIFICATIONS: {
	[Type in Notification["type"]]: Extract<Notification, { type: Type }>;
} = {
	SQ_ADDED_TO_GROUP: {
		type: "SQ_ADDED_TO_GROUP",
		meta: { adderUsername: "Sendou" },
	},
	SQ_READY_CHECK: { type: "SQ_READY_CHECK" },
	SQ_NEW_MATCH: { type: "SQ_NEW_MATCH", meta: { matchId: 1 } },
	TO_ADDED_TO_TEAM: {
		type: "TO_ADDED_TO_TEAM",
		meta: {
			...SAMPLE_TOURNAMENT,
			adderUsername: "Sendou",
			teamName: "Team Olive",
			tournamentTeamId: 1,
		},
	},
	TO_BRACKET_STARTED: {
		type: "TO_BRACKET_STARTED",
		meta: { ...SAMPLE_TOURNAMENT, bracketIdx: 0, bracketName: "Main bracket" },
	},
	TO_CHECK_IN_OPENED: { type: "TO_CHECK_IN_OPENED", meta: SAMPLE_TOURNAMENT },
	TO_TEST_CREATED: { type: "TO_TEST_CREATED", meta: SAMPLE_TOURNAMENT },
	TO_LIKE_RECEIVED: {
		type: "TO_LIKE_RECEIVED",
		meta: { ...SAMPLE_TOURNAMENT, likerUsername: "Sendou" },
	},
	TO_LIKE_ACCEPTED: {
		type: "TO_LIKE_ACCEPTED",
		meta: { ...SAMPLE_TOURNAMENT, accepterUsername: "Sendou" },
	},
	BADGE_ADDED: {
		type: "BADGE_ADDED",
		meta: { badgeName: "In The Zone 42", badgeId: 1 },
	},
	BADGE_MANAGER_ADDED: {
		type: "BADGE_MANAGER_ADDED",
		meta: { badgeName: "In The Zone 42", badgeId: 1 },
	},
	TROPHY_SUBMITTED: {
		type: "TROPHY_SUBMITTED",
		meta: { trophyName: "Golden Roller", submitterUsername: "Sendou" },
	},
	TROPHY_SUBMISSION_ACCEPTED: {
		type: "TROPHY_SUBMISSION_ACCEPTED",
		meta: { trophyName: "Golden Roller", trophyId: 1 },
	},
	TROPHY_SUBMISSION_DECLINED: {
		type: "TROPHY_SUBMISSION_DECLINED",
		meta: { trophyName: "Golden Roller" },
	},
	PLUS_VOTING_STARTED: { type: "PLUS_VOTING_STARTED", meta: { seasonNth: 1 } },
	PLUS_SUGGESTION_ADDED: { type: "PLUS_SUGGESTION_ADDED", meta: { tier: 1 } },
	TAGGED_TO_ART: {
		type: "TAGGED_TO_ART",
		meta: {
			adderUsername: "Sendou",
			adderId: ADMIN_ID,
			artId: 1,
		},
	},
	SEASON_STARTED: { type: "SEASON_STARTED", meta: { seasonNth: 1 } },
	SEASON_ENDED: { type: "SEASON_ENDED", meta: { seasonNth: 1 } },
	SCRIM_NEW_REQUEST: {
		type: "SCRIM_NEW_REQUEST",
		meta: { fromUserId: ADMIN_ID, fromUsername: "Sendou", scrimPostId: 1 },
	},
	SCRIM_SCHEDULED: {
		type: "SCRIM_SCHEDULED",
		meta: { id: 1, ...SAMPLE_OPPONENT },
	},
	SCRIM_CANCELED: {
		type: "SCRIM_CANCELED",
		meta: { id: 1, ...SAMPLE_OPPONENT },
	},
	SCRIM_STARTING_SOON: {
		type: "SCRIM_STARTING_SOON",
		meta: { id: 1, ...SAMPLE_OPPONENT },
	},
	TO_LEAGUE_TIMES_PROPOSED: {
		type: "TO_LEAGUE_TIMES_PROPOSED",
		meta: { tournamentId: 1, matchId: 1, ...SAMPLE_OPPONENT },
	},
	TO_LEAGUE_MATCH_SCHEDULED: {
		type: "TO_LEAGUE_MATCH_SCHEDULED",
		meta: { tournamentId: 1, matchId: 1, ...SAMPLE_OPPONENT },
	},
	TO_LEAGUE_MATCH_STARTING_SOON: {
		type: "TO_LEAGUE_MATCH_STARTING_SOON",
		meta: { tournamentId: 1, matchId: 1, ...SAMPLE_OPPONENT },
	},
	SCRIM_AUTO_DELETED: { type: "SCRIM_AUTO_DELETED", meta: { at: Date.now() } },
	COMMISSIONS_CLOSED: { type: "COMMISSIONS_CLOSED" },
	FRIEND_REQUEST_RECEIVED: {
		type: "FRIEND_REQUEST_RECEIVED",
		meta: { senderId: ADMIN_ID, senderUsername: "Sendou" },
	},
	TEAM_EVENT_ADDED: {
		type: "TEAM_EVENT_ADDED",
		meta: {
			eventName: "Practice",
			teamName: "Team Olive",
			teamCustomUrl: "team-olive",
		},
	},
	SCHEDULE_TEAM_REMINDER: { type: "SCHEDULE_TEAM_REMINDER" },
	CHAT_MENTION: {
		type: "CHAT_MENTION",
		meta: {
			roomId: 1,
			messageId: 1,
			mentionerUsername: "Sendou",
			roomUrl: "/",
		},
	},
};

export const SAMPLE_NOTIFICATION_TYPES = Object.keys(
	SAMPLE_NOTIFICATIONS,
) as Array<Notification["type"]>;
