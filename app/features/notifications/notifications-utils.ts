import type { LoggedInUser } from "~/root";
import { assertUnreachable } from "~/utils/types";
import {
	PLUS_VOTING_PAGE,
	SENDOUQ_PAGE,
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
	// @ts-expect-error xxx: fix maybe
	const { type, meta } = notification.value;

	switch (type) {
		case "BADGE_ADDED":
			return userPage(user);
		case "PLUS_SUGGESTION_ADDED":
			return plusSuggestionPage({ tier: meta.tier });
		case "PLUS_VOTING_STARTED":
			return PLUS_VOTING_PAGE;
		case "SEASON_STARTED":
		case "SQ_ADDED_TO_GROUP":
			return SENDOUQ_PAGE;
		case "SQ_NEW_MATCH":
			return sendouQMatchPage(meta.matchId);
		case "TAGGED_TO_ART":
			return userArtPage(user);
		case "TO_ADDED_TO_TEAM":
			return tournamentTeamPage({
				tournamentId: meta.tournamentId,
				tournamentTeamId: meta.tournamentTeamId,
			});
		case "TO_BRACKET_STARTED":
			return tournamentBracketsPage({
				tournamentId: meta.tournamentId,
				bracketIdx: meta.bracketIdx,
			});
		case "TO_CHECK_IN_OPENED":
			return tournamentRegisterPage(meta.tournamentId);
		default:
			assertUnreachable(type);
	}
};
