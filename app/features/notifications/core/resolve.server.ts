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

/**
 * What resolves each notification type beyond opening the notification list.
 * `null` means nothing does: the notification is informational, or resolving it
 * would cost a query on a hot path for little gain (TO_ADDED_TO_TEAM,
 * TO_TEST_CREATED). Exhaustive on purpose, so a new notification type has to
 * pick a side, and only the types with a trigger can be resolved.
 */
const RESOLUTION_TRIGGERS = {
	SQ_ADDED_TO_GROUP: "visits a SendouQ group page (preparing/looking)",
	SQ_READY_CHECK:
		"responds to the ready check, or it ends (match created or the check expired)",
	SQ_NEW_MATCH: "visits the match page",
	TO_ADDED_TO_TEAM: null,
	TO_BRACKET_STARTED: "visits the tournament's brackets page",
	TO_CHECK_IN_OPENED: "their team checks in (by a member or the organizer)",
	TO_TEST_CREATED: null,
	TO_LIKE_RECEIVED:
		"visits the tournament's LFG page, or their group accepts a like",
	TO_LIKE_ACCEPTED: "visits the tournament's LFG page",
	BADGE_ADDED: null,
	BADGE_MANAGER_ADDED: null,
	TROPHY_SUBMITTED:
		"a reviewer approves/declines the submission or it gets deleted (a lone approval that is not yet enough resolves the approver's own)",
	TROPHY_SUBMISSION_ACCEPTED: null,
	TROPHY_SUBMISSION_DECLINED: null,
	PLUS_VOTING_STARTED: "casts their votes",
	PLUS_SUGGESTION_ADDED: "visits the suggestions page of the tier",
	TAGGED_TO_ART: null,
	SEASON_STARTED: null,
	SCRIM_NEW_REQUEST:
		"a request for the post is accepted (settling the post), the request is canceled by its sender, or the post is deleted",
	SCRIM_SCHEDULED: "visits the scrim's page, or the scrim gets canceled",
	SCRIM_CANCELED: null,
	SCRIM_STARTING_SOON: "visits the scrim's page, or the scrim gets canceled",
	SCRIM_AUTO_DELETED: null,
	COMMISSIONS_CLOSED: null,
	FRIEND_REQUEST_RECEIVED:
		"accepts or declines the request, or the sender cancels it",
} as const satisfies Record<Notification["type"], string | null>;

type ResolvableNotificationType = {
	[T in Notification["type"]]: (typeof RESOLUTION_TRIGGERS)[T] extends null
		? never
		: T;
}[Notification["type"]];

/**
 * Marks the users' unseen notifications of the given type as seen because they
 * addressed the thing the notification is about, so the unseen dot only shows
 * for notifications that still need the user's attention. Never throws; a
 * failed resolution only logs since the caller's action/loader matters more.
 *
 * See `RESOLUTION_TRIGGERS` for what resolves each type.
 */
export async function resolveNotifications<
	T extends ResolvableNotificationType,
>({
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
