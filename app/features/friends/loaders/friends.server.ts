import * as R from "remeda";
import { requireUser } from "~/features/auth/core/user.server";
import * as ScheduleViews from "~/features/availability/core/ScheduleViews.server";
import { getViewerTimezone } from "~/features/timezone/timezone-context.server";
import { userPage } from "~/utils/urls";
import * as FriendRepository from "../FriendRepository.server";
import {
	friendActivitySortValue,
	friendSectionSortValue,
} from "../friends-constants";
import { friendActivityResolver } from "../friends-utils.server";

export type FriendsLoaderData = typeof loader;

export const loader = async () => {
	const user = requireUser();

	const friendsWithActivity = await FriendRepository.findByUserIdWithActivity(
		user.id,
	);
	const unique = R.uniqueBy(friendsWithActivity, (f) => f.id);

	const pendingRequests = await FriendRepository.findPendingSentRequests(
		user.id,
	);
	const incomingRequests = await FriendRepository.findPendingReceivedRequests(
		user.id,
	);
	const friendIds = unique.map((f) => f.id);
	const resolveActivity = await friendActivityResolver({
		viewerId: user.id,
		friendIds,
	});
	const schedules = await ScheduleViews.friendWeeks({
		userIds: friendIds,
		timezone: getViewerTimezone() ?? "UTC",
		viewerId: user.id,
	});

	const listed = unique.map((row) => {
		const activity = resolveActivity(row);

		return {
			row,
			base: {
				id: row.id,
				username: row.username,
				avatar: row.avatar,
				url: userPage({
					id: row.id,
					customUrl: row.customUrl,
				}),
				subtitle: activity.subtitle,
				badge: activity.badge,
				activityType: activity.type,
				matchId: activity.matchId,
				tournamentId: activity.tournamentId,
				lobbyId: activity.lobbyId,
				stream: activity.stream,
				schedule: schedules.get(row.id) ?? null,
			},
		};
	});

	const friends = R.sortBy(
		listed.flatMap(({ row, base }) =>
			row.friendshipId === null
				? []
				: [
						{
							...base,
							friendshipId: row.friendshipId,
							friendshipCreatedAt: row.friendshipCreatedAt,
							isPinned: Boolean(row.isPinned),
						},
					],
		),
		[(friend) => friendSectionSortValue(friend), "asc"],
		[(friend) => friendActivitySortValue(friend.activityType), "desc"],
		[(friend) => (friend.schedule ? 1 : 0), "desc"],
		[(friend) => friend.friendshipCreatedAt ?? 0, "desc"],
	);

	const teamMembers = R.sortBy(
		listed.flatMap(({ row, base }) =>
			row.friendshipId === null ? [{ ...base, isPinned: false }] : [],
		),
		[(tm) => friendActivitySortValue(tm.activityType), "desc"],
		[(tm) => (tm.schedule ? 1 : 0), "desc"],
	);

	return {
		friends,
		teamMembers,
		incomingRequests: incomingRequests.map((req) => ({
			id: req.id,
			sender: {
				id: req.senderId,
				username: req.senderUsername,
				avatar: req.senderAvatar,
				url: userPage({
					id: req.senderId,
					customUrl: req.senderCustomUrl,
				}),
			},
		})),
		pendingRequests: pendingRequests.map((req) => ({
			id: req.id,
			createdAt: req.createdAt,
			receiver: {
				id: req.receiverId,
				username: req.receiverUsername,
				avatar: req.receiverAvatar,
				url: userPage({
					id: req.receiverId,
					customUrl: req.receiverCustomUrl,
				}),
			},
		})),
	};
};
