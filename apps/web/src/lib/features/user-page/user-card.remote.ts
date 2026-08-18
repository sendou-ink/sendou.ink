import * as R from "remeda";
import * as v from "valibot";
import { getUser } from "#lib/features/auth/user.server.ts";
import * as FriendRepository from "#lib/features/friends/FriendRepository.server.ts";
import * as ScrimPostRepository from "#lib/features/scrims/ScrimPostRepository.server.ts";
import { id } from "#lib/utils/schemas.ts";
import { query } from "$app/server";
import * as UserCardRepository from "./UserCardRepository.server.ts";
import type { UserCardData, UserCardFriendship } from "./user-card-types.ts";

/**
 * Card data for one user, loaded by the `UserCard` component itself. Every card of a page calls
 * this in the same macrotask, so they resolve as one request and one batch of database queries.
 *
 * `withFriendCode` is a request, not a grant: friend codes are private to the people a user is
 * scheduled to play with, so the server resolves who the viewer may see one of (see
 * {@link friendCodeVisibleUserIds}) rather than trusting the caller.
 */
export const getUserCard = query.batch(
	v.object({ userId: id, withFriendCode: v.boolean() }),
	async (args) => {
		const userIds = R.unique(args.map((arg) => arg.userId));
		const friendCodeRequestedIds = R.unique(
			args.filter((arg) => arg.withFriendCode).map((arg) => arg.userId),
		);

		// xxx: add cache
		const [{ userCards }, friendCodeVisibleIds] = await Promise.all([
			UserCardRepository.findAllByUserIds({
				userIds,
				include: { friendCode: friendCodeRequestedIds.length > 0 },
			}),
			friendCodeVisibleUserIds(friendCodeRequestedIds),
		]);

		return ({ userId, withFriendCode }): UserCardData | undefined => {
			const card = userCards.get(userId);
			if (!card) return undefined;

			if (withFriendCode && friendCodeVisibleIds.has(userId)) return card;

			return { ...card, friendCode: null };
		};
	},
);

/**
 * Viewer-relative friendship data for a single user, lazy-loaded by the `UserCard`
 * popover when it opens (keeps `isFriend` + `mutualFriends` out of the batched card
 * query). Resolves to empty values when there is no logged-in viewer. Mutual friends
 * are only resolved when the card opts in via `withMutualFriends` (some views, e.g.
 * match pages, don't surface them), so the extra query is otherwise skipped.
 */
export const getUserCardFriendship = query(
	v.object({ userId: id, withMutualFriends: v.boolean() }),
	async ({ userId, withMutualFriends }): Promise<UserCardFriendship> => {
		const viewer = getUser();

		if (!viewer) {
			return {
				isFriend: false,
				sentFriendRequest: false,
				incomingFriendRequestId: null,
				mutualFriends: [],
			};
		}

		const [friendship, pendingRequest, mutualFriends] = await Promise.all([
			FriendRepository.findFriendship({
				userOneId: viewer.id,
				userTwoId: userId,
			}),
			FriendRepository.findFriendRequestBetween({
				senderId: viewer.id,
				receiverId: userId,
			}),
			withMutualFriends
				? FriendRepository.findMutualFriends({
						loggedInUserId: viewer.id,
						targetUserId: userId,
					})
				: [],
		]);

		return {
			isFriend: Boolean(friendship),
			sentFriendRequest: pendingRequest?.senderId === viewer.id,
			incomingFriendRequestId:
				pendingRequest && pendingRequest.senderId !== viewer.id
					? pendingRequest.id
					: null,
			mutualFriends,
		};
	},
);

/**
 * Of `userIds`, the ones whose friend code the viewer has a reason to see right now: they share an
 * accepted scrim. Staff see every requested code, and a logged out viewer none.
 */
async function friendCodeVisibleUserIds(
	userIds: Array<number>,
): Promise<Set<number>> {
	if (userIds.length === 0) return new Set();

	const viewer = getUser();
	if (!viewer) return new Set();
	if (viewer.roles.includes("STAFF")) return new Set(userIds);

	return ScrimPostRepository.findUserIdsSharingAcceptedScrim({
		userId: viewer.id,
		otherUserIds: userIds,
	});
}
