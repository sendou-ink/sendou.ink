import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import { logger } from "~/utils/logger";
import * as NotificationRepository from "../NotificationRepository.server";
import type { Notification } from "../notifications-types";

type NotificationOfType<T extends Notification["type"]> = Extract<
	Notification,
	{ type: T }
>;

type MetaFilter<T extends Notification["type"]> =
	NotificationOfType<T> extends { meta: infer M } ? Partial<M> : undefined;

// xxx: check every case and see what can be removed
/**
 * Marks the users' unseen notifications of the given type as seen because they
 * addressed the thing the notification is about, so the unseen dot only shows
 * for notifications that still need the user's attention. Never throws; a
 * failed resolution only logs since the caller's action/loader matters more.
 *
 * Resolution policy per type (beyond opening the notification list):
 * - SQ_ADDED_TO_GROUP: visits a SendouQ group page (preparing/looking)
 * - SQ_READY_CHECK: responds to the ready check, or it ends (match created
 *   or the check expired)
 * - SQ_NEW_MATCH: visits the match page
 * - TO_BRACKET_STARTED: visits the tournament's brackets page
 * - TO_CHECK_IN_OPENED: their team checks in (by a member or the organizer)
 * - TO_LIKE_RECEIVED: visits the tournament's LFG page, or their group
 *   accepts a like
 * - TO_LIKE_ACCEPTED: visits the tournament's LFG page
 * - TROPHY_SUBMITTED: a reviewer approves/declines the submission or it gets
 *   deleted (a lone approval that is not yet enough resolves the approver's own)
 * - PLUS_VOTING_STARTED: casts their votes
 * - PLUS_SUGGESTION_ADDED: visits the suggestions page of the tier
 * - SCRIM_NEW_REQUEST: a request for the post is accepted (settling the post),
 *   the request is canceled by its sender, or the post is deleted
 * - SCRIM_SCHEDULED, SCRIM_STARTING_SOON: visits the scrim's page, or the
 *   scrim gets canceled
 * - FRIEND_REQUEST_RECEIVED: accepts or declines the request, or the sender
 *   cancels it
 * - Rest are informational only (BADGE_ADDED, BADGE_MANAGER_ADDED,
 *   TROPHY_SUBMISSION_ACCEPTED, TROPHY_SUBMISSION_DECLINED, TAGGED_TO_ART,
 *   SEASON_STARTED, SCRIM_CANCELED, SCRIM_AUTO_DELETED, COMMISSIONS_CLOSED)
 *   or not worth a resolve query on a hot path (TO_ADDED_TO_TEAM,
 *   TO_TEST_CREATED): only opening the list resolves them
 */
export async function resolveNotifications<T extends Notification["type"]>({
	userIds,
	type,
	meta,
}: {
	/** Users whose notifications got addressed */
	userIds: Array<number>;
	/** Notification type to resolve */
	type: T;
	/** Only notifications whose meta matches every given key/value pair are resolved (e.g. `{ tournamentId }`) */
	meta?: MetaFilter<T>;
}) {
	try {
		const changedUserIds = await NotificationRepository.markAsSeenByType({
			userIds,
			type,
			meta,
		});
		ChatSystemMessage.notifyNotificationsChanged(changedUserIds);
	} catch (err) {
		logger.error("Failed to resolve notifications", err);
	}
}
