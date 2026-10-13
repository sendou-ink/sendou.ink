import * as R from "remeda";
import { requireUser } from "~/features/auth/core/user.server";
import * as FriendSchedule from "~/features/availability/core/FriendSchedule.server";
import { getViewerTimezone } from "~/features/timezone/timezone-context.server";
import { userPage } from "~/utils/urls";
import * as FriendRepository from "../FriendRepository.server";
import {
	friendActivitySortValue,
	friendSectionSortValue,
} from "../friends-constants";
import {
	resolveFriendActivity,
	resolveSendouQMatchStreams,
} from "../friends-utils.server";

export type FriendsLoaderData = typeof loader;

export const loader = async () => {
	const user = requireUser();

	const friendsWithActivity = await FriendRepository.findByUserIdWithActivity(
		user.id,
	);
	const unique = R.uniqueBy(friendsWithActivity, (f) => f.id);

	const [pendingRequests, incomingRequests, streamedSendouQMatches, schedules] =
		await Promise.all([
			FriendRepository.findPendingSentRequests(user.id),
			FriendRepository.findPendingReceivedRequests(user.id),
			resolveSendouQMatchStreams(),
			FriendSchedule.findByUserIds({
				userIds: unique.map((f) => f.id),
				timezone: getViewerTimezone() ?? "UTC",
				viewerId: user.id,
			}),
		]);

	const friends = R.sortBy(
		unique
			.filter((f) => f.friendshipId !== null)
			.map((friend) => {
				const activity = resolveFriendActivity({
					friendId: friend.id,
					tournamentId: friend.tournamentId,
					tournamentName: friend.tournamentName,
					teamMemberCount: friend.teamMemberCount,
					tournamentMinTeamSize: friend.tournamentMinTeamSize,
					sendouQMatchStreams: streamedSendouQMatches,
				});

				return {
					id: friend.id,
					friendshipId: friend.friendshipId as number,
					username: friend.username,
					avatar: friend.avatar,
					url: userPage({
						id: friend.id,
						customUrl: friend.customUrl,
					}),
					subtitle: activity.subtitle,
					badge: activity.badge,
					activityType: activity.type,
					matchId: activity.matchId,
					tournamentId: activity.tournamentId ?? friend.tournamentId,
					stream: activity.stream,
					friendshipCreatedAt: friend.friendshipCreatedAt,
					isPinned: Boolean(friend.isPinned),
					schedule: schedules.get(friend.id) ?? null,
				};
			}),
		[(friend) => friendSectionSortValue(friend), "asc"],
		[(friend) => friendActivitySortValue(friend.activityType), "desc"],
		[(friend) => (friend.schedule ? 1 : 0), "desc"],
		[(friend) => friend.friendshipCreatedAt ?? 0, "desc"],
	);

	const teamMembers = R.sortBy(
		unique
			.filter((f) => f.friendshipId === null)
			.map((tm) => {
				const activity = resolveFriendActivity({
					friendId: tm.id,
					tournamentId: tm.tournamentId,
					tournamentName: tm.tournamentName,
					teamMemberCount: tm.teamMemberCount,
					tournamentMinTeamSize: tm.tournamentMinTeamSize,
					sendouQMatchStreams: streamedSendouQMatches,
				});

				return {
					id: tm.id,
					username: tm.username,
					avatar: tm.avatar,
					url: userPage({
						id: tm.id,
						customUrl: tm.customUrl,
					}),
					subtitle: activity.subtitle,
					badge: activity.badge,
					activityType: activity.type,
					matchId: activity.matchId,
					tournamentId: activity.tournamentId ?? tm.tournamentId,
					stream: activity.stream,
					isPinned: false,
					schedule: schedules.get(tm.id) ?? null,
				};
			}),
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
