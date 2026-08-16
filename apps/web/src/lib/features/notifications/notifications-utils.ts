import { assertUnreachable } from "@sendou/utils/types";
import type { NotificationRow } from "#lib/components/layout/layout-types.ts";
import {
	FRIENDS_PAGE,
	SENDOUQ_PAGE,
	sendouQMatchPage,
	userPage,
} from "#lib/utils/urls.ts";
import type { Notification } from "./notifications-types.ts";

const NEW_TROPHY_PAGE = "/trophies/new";
const PLUS_VOTING_PAGE = "/plus/voting";
const SENDOUQ_READY_PAGE = "/q/ready";

/** Values the notification's title and text interpolate. Some notification types have none. */
export const notificationMeta = (notification: Notification) =>
	"meta" in notification ? notification.meta : undefined;

export const notificationNavIcon = (type: Notification["type"]) => {
	switch (type) {
		case "BADGE_ADDED":
		case "BADGE_MANAGER_ADDED":
			return "badges";
		case "TROPHY_SUBMITTED":
		case "TROPHY_SUBMISSION_ACCEPTED":
		case "TROPHY_SUBMISSION_DECLINED":
			return "trophies";
		case "PLUS_SUGGESTION_ADDED":
		case "PLUS_VOTING_STARTED":
			return "plus";
		case "SQ_ADDED_TO_GROUP":
		case "SQ_NEW_MATCH":
		case "SQ_READY_CHECK":
		case "SEASON_STARTED":
			return "sendouq";
		case "TAGGED_TO_ART":
		case "COMMISSIONS_CLOSED":
			return "art";
		case "TO_ADDED_TO_TEAM":
		case "TO_BRACKET_STARTED":
		case "TO_CHECK_IN_OPENED":
		case "TO_TEST_CREATED":
		case "TO_LIKE_RECEIVED":
		case "TO_LIKE_ACCEPTED":
			return "medal";
		case "SCRIM_NEW_REQUEST":
		case "SCRIM_SCHEDULED":
		case "SCRIM_CANCELED":
		case "SCRIM_STARTING_SOON":
		case "SCRIM_AUTO_DELETED":
			return "scrims";
		case "FRIEND_REQUEST_RECEIVED":
			return "sendou_love";
		default:
			assertUnreachable(type);
	}
};

export const notificationLink = (notification: Notification) => {
	switch (notification.type) {
		case "BADGE_ADDED":
		case "BADGE_MANAGER_ADDED":
			return `/badges/${notification.meta.badgeId}`;
		case "TROPHY_SUBMITTED":
		case "TROPHY_SUBMISSION_DECLINED":
			return NEW_TROPHY_PAGE;
		case "TROPHY_SUBMISSION_ACCEPTED":
			return `/trophies/${notification.meta.trophyId}`;
		case "PLUS_SUGGESTION_ADDED":
			return `/plus/suggestions?tier=${notification.meta.tier}`;
		case "PLUS_VOTING_STARTED":
			return PLUS_VOTING_PAGE;
		case "SEASON_STARTED":
		case "SQ_ADDED_TO_GROUP":
			return SENDOUQ_PAGE;
		case "SQ_NEW_MATCH":
			return sendouQMatchPage(notification.meta.matchId);
		case "SQ_READY_CHECK":
			return SENDOUQ_READY_PAGE;
		case "TAGGED_TO_ART":
			return `/u/${notification.meta.adderDiscordId}/art?source=MADE-BY&big=${notification.meta.artId}`;
		case "TO_ADDED_TO_TEAM":
			return `/to/${notification.meta.tournamentId}/teams/${notification.meta.tournamentTeamId}`;
		case "TO_BRACKET_STARTED":
			return `/to/${notification.meta.tournamentId}/brackets${typeof notification.meta.bracketIdx === "number" ? `?idx=${notification.meta.bracketIdx}` : ""}`;
		case "TO_TEST_CREATED":
		case "TO_CHECK_IN_OPENED":
			return `/to/${notification.meta.tournamentId}/register`;
		case "SCRIM_NEW_REQUEST":
		case "SCRIM_AUTO_DELETED":
			return "/scrims";
		case "SCRIM_CANCELED":
		case "SCRIM_SCHEDULED":
		case "SCRIM_STARTING_SOON":
			return `/scrims/${notification.meta.id}`;
		case "COMMISSIONS_CLOSED":
			return `${userPage({ discordId: notification.meta.discordId })}/edit`;
		case "FRIEND_REQUEST_RECEIVED":
			return FRIENDS_PAGE;
		case "TO_LIKE_RECEIVED":
		case "TO_LIKE_ACCEPTED":
			return `/to/${notification.meta.tournamentId}/looking`;
		default:
			assertUnreachable(notification);
	}
};

type LoadedNotification = Notification & {
	id: number;
	createdAt: number;
	seen: number;
	pictureUrl?: string | null;
};

/** Maps repository notifications to the presentational rows the bell popover renders. */
export function toNotificationRows(
	notifications: LoadedNotification[],
): NotificationRow[] {
	return notifications.map((notification) => ({
		id: notification.id,
		type: notification.type,
		meta: notificationMeta(notification) as
			| Record<string, string | number>
			| undefined,
		seen: notification.seen,
		createdAt: notification.createdAt,
		pictureUrl: notification.pictureUrl,
		href: notificationLink(notification),
		navIcon: notificationNavIcon(notification.type),
	}));
}
