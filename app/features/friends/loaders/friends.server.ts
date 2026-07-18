import * as R from "remeda";
import { requireUser } from "~/features/auth/core/user.server";
import { userPage } from "~/utils/urls";
import * as FriendRepository from "../FriendRepository.server";
import { friendActivitySortValue } from "../friends-constants";
import { resolveFriendActivity } from "../friends-utils.server";

export type FriendsLoaderData = typeof loader;

export const loader = async () => {
	const user = requireUser();

	const [friendsWithActivity, pendingRequests, incomingRequests] =
		await Promise.all([
			FriendRepository.findByUserIdWithActivity(user.id),
			FriendRepository.findPendingSentRequests(user.id),
			FriendRepository.findPendingReceivedRequests(user.id),
		]);

	const unique = R.uniqueBy(friendsWithActivity, (f) => f.id);

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
				});

				return {
					id: friend.id,
					friendshipId: friend.friendshipId as number,
					username: friend.username,
					discordId: friend.discordId,
					discordAvatar: friend.discordAvatar,
					customAvatarUrl: friend.customAvatarUrl,
					url: userPage({
						discordId: friend.discordId,
						customUrl: friend.customUrl,
					}),
					subtitle: activity.subtitle,
					badge: activity.badge,
					activityType: activity.type,
					matchId: activity.matchId,
					tournamentId: activity.tournamentId ?? friend.tournamentId,
					friendshipCreatedAt: friend.friendshipCreatedAt,
				};
			}),
		[(friend) => friendActivitySortValue(friend.activityType), "desc"],
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
				});

				return {
					id: tm.id,
					username: tm.username,
					discordId: tm.discordId,
					discordAvatar: tm.discordAvatar,
					customAvatarUrl: tm.customAvatarUrl,
					url: userPage({
						discordId: tm.discordId,
						customUrl: tm.customUrl,
					}),
					subtitle: activity.subtitle,
					badge: activity.badge,
					activityType: activity.type,
					matchId: activity.matchId,
					tournamentId: activity.tournamentId ?? tm.tournamentId,
				};
			}),
		[(tm) => friendActivitySortValue(tm.activityType), "desc"],
	);

	return {
		friends,
		teamMembers,
		incomingRequests: incomingRequests.map((req) => ({
			id: req.id,
			sender: {
				id: req.senderId,
				username: req.senderUsername,
				discordId: req.senderDiscordId,
				discordAvatar: req.senderDiscordAvatar,
				customAvatarUrl: req.senderCustomAvatarUrl,
				url: userPage({
					discordId: req.senderDiscordId,
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
				discordId: req.receiverDiscordId,
				discordAvatar: req.receiverDiscordAvatar,
				customAvatarUrl: req.receiverCustomAvatarUrl,
				url: userPage({
					discordId: req.receiverDiscordId,
					customUrl: req.receiverCustomUrl,
				}),
			},
		})),
	};
};
