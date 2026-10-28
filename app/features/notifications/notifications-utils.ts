import { userArtPage } from "~/features/art/art-urls";
import { chatOpenedPage } from "~/features/chat/chat-urls";
import { plusSuggestionPage } from "~/features/plus-suggestions/plus-suggestions-urls";
import { tournamentBracketsPage } from "~/features/tournament-bracket/tournament-bracket-urls";
import { userSeasonsPage } from "~/features/user-page/user-page-urls";
import { assertUnreachable } from "~/utils/types";
import {
	ART_PAGE,
	badgePage,
	EVENTS_PAGE,
	FRIENDS_PAGE,
	lobbyPage,
	NEW_TROPHY_PAGE,
	PLUS_VOTING_PAGE,
	scrimPage,
	scrimsPage,
	SENDOUQ_PAGE,
	SENDOUQ_READY_PAGE,
	sendouQMatchPage,
	teamSchedulePage,
	tournamentMatchPage,
	tournamentRegisterPage,
	tournamentSubsPage,
	tournamentTeamPage,
	trophyPage,
	userEditProfilePage,
	type UserLinkArgs,
} from "~/utils/urls";
import type { Notification } from "./notifications-types";

const PUSH_SERVICE_HOSTS = [
	"fcm.googleapis.com",
	"android.googleapis.com",
	"jmt17.google.com",
	"updates.push.services.mozilla.com",
	"web.push.apple.com",
];

const PUSH_SERVICE_HOST_SUFFIXES = [
	".push.services.mozilla.com",
	".push.apple.com",
	".notify.windows.com",
];

const STRICT_HOSTNAME_REGEX = /^[a-z0-9-]+(\.[a-z0-9-]+)*$/;

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
		case "SEASON_ENDED":
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
		case "TO_LEAGUE_TIMES_PROPOSED":
		case "TO_LEAGUE_MATCH_SCHEDULED":
		case "TO_LEAGUE_MATCH_STARTING_SOON":
			return "medal";
		case "SCRIM_NEW_REQUEST":
		case "SCRIM_SCHEDULED":
		case "SCRIM_CANCELED":
		case "SCRIM_STARTING_SOON":
		case "SCRIM_AUTO_DELETED":
			return "scrims";
		case "FRIEND_REQUEST_RECEIVED":
			return "sendou_love";
		case "TEAM_EVENT_ADDED":
			return "t";
		case "SCHEDULE_TEAM_REMINDER":
			return "calendar";
		case "CHAT_MENTION":
			return "u";
		case "LOBBY_CHECK_IN_OPENED":
		case "LOBBY_STARTED":
		case "LOBBY_PROMOTED":
		case "LOBBY_HOST":
		case "LOBBY_READY_CHECK":
			return "lobbies";
		default:
			assertUnreachable(type);
	}
};

export const notificationLink = (
	notification: Notification,
	recipient?: UserLinkArgs,
) => {
	switch (notification.type) {
		case "BADGE_ADDED":
			return badgePage(notification.meta.badgeId);
		case "BADGE_MANAGER_ADDED":
			return badgePage(notification.meta.badgeId);
		case "TROPHY_SUBMITTED":
		case "TROPHY_SUBMISSION_DECLINED":
			return NEW_TROPHY_PAGE;
		case "TROPHY_SUBMISSION_ACCEPTED":
			return trophyPage(notification.meta.trophyId);
		case "PLUS_SUGGESTION_ADDED":
			return plusSuggestionPage({ tier: notification.meta.tier });
		case "PLUS_VOTING_STARTED":
			return PLUS_VOTING_PAGE;
		case "SEASON_STARTED":
		case "SQ_ADDED_TO_GROUP":
			return SENDOUQ_PAGE;
		case "SEASON_ENDED":
			return recipient
				? userSeasonsPage({
						user: recipient,
						season: notification.meta.seasonNth,
					})
				: SENDOUQ_PAGE;
		case "SQ_NEW_MATCH":
			return sendouQMatchPage(notification.meta.matchId);
		case "SQ_READY_CHECK":
			return SENDOUQ_READY_PAGE;
		case "TAGGED_TO_ART":
			return userArtPage(
				{ id: notification.meta.adderId },
				"MADE-BY",
				notification.meta.artId,
			);
		case "TO_ADDED_TO_TEAM":
			return tournamentTeamPage({
				tournamentId: notification.meta.tournamentId,
				tournamentTeamId: notification.meta.tournamentTeamId,
			});
		case "TO_BRACKET_STARTED":
			return tournamentBracketsPage({
				tournamentId: notification.meta.tournamentId,
				bracketIdx: notification.meta.bracketIdx,
			});
		case "TO_TEST_CREATED":
		case "TO_CHECK_IN_OPENED":
			return tournamentRegisterPage(notification.meta.tournamentId);
		case "SCRIM_NEW_REQUEST":
		case "SCRIM_AUTO_DELETED": {
			return scrimsPage();
		}
		case "SCRIM_CANCELED":
		case "SCRIM_SCHEDULED":
		case "SCRIM_STARTING_SOON": {
			return scrimPage(notification.meta.id);
		}
		case "COMMISSIONS_CLOSED": {
			return recipient ? userEditProfilePage(recipient) : ART_PAGE;
		}
		case "FRIEND_REQUEST_RECEIVED": {
			return FRIENDS_PAGE;
		}
		case "TO_LIKE_RECEIVED":
		case "TO_LIKE_ACCEPTED": {
			return tournamentSubsPage(notification.meta.tournamentId);
		}
		case "TO_LEAGUE_TIMES_PROPOSED":
		case "TO_LEAGUE_MATCH_SCHEDULED":
		case "TO_LEAGUE_MATCH_STARTING_SOON": {
			return tournamentMatchPage({
				tournamentId: notification.meta.tournamentId,
				matchId: notification.meta.matchId,
			});
		}
		case "TEAM_EVENT_ADDED": {
			return teamSchedulePage(notification.meta.teamCustomUrl);
		}
		case "SCHEDULE_TEAM_REMINDER": {
			return EVENTS_PAGE;
		}
		case "LOBBY_CHECK_IN_OPENED":
		case "LOBBY_STARTED":
		case "LOBBY_PROMOTED":
		case "LOBBY_HOST":
		case "LOBBY_READY_CHECK": {
			return lobbyPage(notification.meta.lobbyId);
		}
		case "CHAT_MENTION": {
			return chatOpenedPage({
				pageUrl: notification.meta.roomUrl,
				roomId: notification.meta.roomId,
			});
		}
		default:
			assertUnreachable(notification);
	}
};

/** Whether the push subscription endpoint points at a known browser push service over the default HTTPS port. The server POSTs to this URL so arbitrary hosts must not be accepted. */
export function isPushServiceEndpoint(endpoint: string) {
	let url: URL;
	try {
		url = new URL(endpoint);
	} catch {
		return false;
	}

	if (url.protocol !== "https:" || url.port !== "") return false;
	// web-push connects via legacy url.parse which truncates hosts at chars like ; { ` that WHATWG URL keeps
	if (!STRICT_HOSTNAME_REGEX.test(url.hostname)) return false;

	return (
		PUSH_SERVICE_HOSTS.includes(url.hostname) ||
		PUSH_SERVICE_HOST_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix))
	);
}
