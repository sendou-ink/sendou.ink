import type { LoggedInUser } from "~/root";
import { assertUnreachable } from "~/utils/types";
import {
	PLUS_VOTING_PAGE,
	SENDOUQ_PAGE,
	badgePage,
	plusSuggestionPage,
	sendouQMatchPage,
	tournamentBracketsPage,
	tournamentRegisterPage,
	tournamentTeamPage,
	userArtPage,
	userPage,
} from "~/utils/urls";
import type { Notification } from "./notifications-types";
import type { LoaderNotification } from "./routes/notifications.peek";

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
			return "medal";
		default:
			assertUnreachable(type);
	}
};

export const notificationLink = ({
	notification,
	user,
}: { notification: LoaderNotification; user: LoggedInUser }) => {
	switch (notification.type) {
		case "BADGE_ADDED":
			return userPage(user);
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
			return userArtPage(user);
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
		case "TO_CHECK_IN_OPENED":
			return tournamentRegisterPage(notification.meta.tournamentId);
		default:
			assertUnreachable(notification);
	}
};
