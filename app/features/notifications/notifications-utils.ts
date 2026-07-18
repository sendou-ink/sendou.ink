import { assertUnreachable } from "~/utils/types";
import {
	badgePage,
	FRIENDS_PAGE,
	PLUS_VOTING_PAGE,
	plusSuggestionPage,
	SENDOUQ_PAGE,
	scrimPage,
	scrimsPage,
	sendouQMatchPage,
	tournamentBracketsPage,
	tournamentRegisterPage,
	tournamentSubsPage,
	tournamentTeamPage,
	userArtPage,
	userEditProfilePage,
} from "~/utils/urls";
import type { Notification } from "./notifications-types";

export const notificationNavIcon = (type: Notification["type"]) => {
	switch (type) {
		case "BADGE_ADDED":
		case "BADGE_MANAGER_ADDED":
			return "badges";
		case "PLUS_SUGGESTION_ADDED":
		case "PLUS_VOTING_STARTED":
			return "plus";
		case "SQ_ADDED_TO_GROUP":
		case "SQ_NEW_MATCH":
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
			return badgePage(notification.meta.badgeId);
		case "BADGE_MANAGER_ADDED":
			return badgePage(notification.meta.badgeId);
		case "PLUS_SUGGESTION_ADDED":
			return plusSuggestionPage({ tier: notification.meta.tier });
		case "PLUS_VOTING_STARTED":
			return PLUS_VOTING_PAGE;
		case "SEASON_STARTED":
		case "SQ_ADDED_TO_GROUP":
			return SENDOUQ_PAGE;
		case "SQ_NEW_MATCH":
			return sendouQMatchPage(notification.meta.matchId);
		case "TAGGED_TO_ART":
			return userArtPage(
				{ discordId: notification.meta.adderDiscordId },
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
			return userEditProfilePage({ discordId: notification.meta.discordId });
		}
		case "FRIEND_REQUEST_RECEIVED": {
			return FRIENDS_PAGE;
		}
		case "TO_LIKE_RECEIVED":
		case "TO_LIKE_ACCEPTED": {
			return tournamentSubsPage(notification.meta.tournamentId);
		}
		default:
			assertUnreachable(notification);
	}
};
