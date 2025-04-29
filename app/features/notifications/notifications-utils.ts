import { assertUnreachable } from "~/utils/types";
import {
	PLUS_VOTING_PAGE,
	SENDOUQ_PAGE,
	badgePage,
	plusSuggestionPage,
	scrimPage,
	scrimsPage,
	sendouQMatchPage,
	tournamentBracketsPage,
	tournamentRegisterPage,
	tournamentTeamPage,
	userArtPage,
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
			return "art";
		case "TO_ADDED_TO_TEAM":
		case "TO_BRACKET_STARTED":
		case "TO_CHECK_IN_OPENED":
		case "TO_TEST_CREATED":
			return "medal";
		case "SCRIM_NEW_REQUEST":
		case "SCRIM_SCHEDULED":
			return "scrims";
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
		case "SCRIM_NEW_REQUEST": {
			return scrimsPage();
		}
		case "SCRIM_SCHEDULED": {
			return scrimPage(notification.meta.id);
		}
		default:
			assertUnreachable(notification);
	}
};
