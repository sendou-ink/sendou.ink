import * as R from "remeda";
import { requireUser } from "~/features/auth/core/user.server";
import { userPage } from "~/utils/urls";
import * as FriendRepository from "../FriendRepository.server";
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

	const friends = unique
		.filter((f) => f.friendshipId !== null)
		.map((friend) => {
			const activity = resolveFriendActivity(friend.id, friend.tournamentName);

			return {
				id: friend.id,
				friendshipId: friend.friendshipId as number,
				username: friend.username,
				discordId: friend.discordId,
				discordAvatar: friend.discordAvatar,
				url: userPage({
					discordId: friend.discordId,
					customUrl: friend.customUrl,
				}),
				subtitle: activity.subtitle,
				badge: activity.badge,
				tournamentId: friend.tournamentId,
				friendshipCreatedAt: friend.friendshipCreatedAt,
			};
		});

	friends.sort((a, b) => {
		const aActive = a.subtitle ? 1 : 0;
		const bActive = b.subtitle ? 1 : 0;
		if (aActive !== bActive) return bActive - aActive;

		return (b.friendshipCreatedAt ?? 0) - (a.friendshipCreatedAt ?? 0);
	});

	const teamMembers = unique
		.filter((f) => f.friendshipId === null)
		.map((tm) => {
			const activity = resolveFriendActivity(tm.id, tm.tournamentName);

			return {
				id: tm.id,
				username: tm.username,
				discordId: tm.discordId,
				discordAvatar: tm.discordAvatar,
				url: userPage({
					discordId: tm.discordId,
					customUrl: tm.customUrl,
				}),
				subtitle: activity.subtitle,
				badge: activity.badge,
				tournamentId: tm.tournamentId,
			};
		});

	teamMembers.sort((a, b) => {
		const aActive = a.subtitle ? 1 : 0;
		const bActive = b.subtitle ? 1 : 0;
		return bActive - aActive;
	});

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
				url: userPage({
					discordId: req.receiverDiscordId,
					customUrl: req.receiverCustomUrl,
				}),
			},
		})),
	};
};
