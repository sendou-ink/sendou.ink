import { formatDistance } from "date-fns";
import type { LoaderFunction } from "react-router";
import * as R from "remeda";
import { getUser } from "~/features/auth/core/user.server";
import {
	nextNonCompletedVoting,
	rangeToMonthYear,
} from "~/features/plus-voting/core";
import { isVotingOpen } from "~/features/plus-voting/core/voting-time";
import * as PlusVotingRepository from "~/features/plus-voting/PlusVotingRepository.server";
import * as UserCardRepository from "~/features/user-card/UserCardRepository.server";
import type { UserCardData } from "~/features/user-card/user-card-types";

export type PlusVotingLoaderData =
	// next voting date is not in the system
	| {
			type: "noTimeDefinedInfo";
	  }
	// voting is not active OR user is not eligible to vote
	| {
			type: "timeInfo";
			voted?: boolean;
			timeInfo: {
				timestamp: number;
				timing: "starts" | "ends";
				relativeTime: string;
			};
	  }
	// user can vote
	| {
			type: "voting";
			usersForVoting: PlusVotingRepository.UsersForVoting;
			userCards: Map<number, UserCardData>;
			votingEnds: {
				timestamp: number;
				relativeTime: string;
			};
	  };

export const loader: LoaderFunction = async () => {
	const user = getUser();

	const now = new Date();
	const nextVotingRange = nextNonCompletedVoting(now);

	if (!nextVotingRange) {
		return { type: "noTimeDefinedInfo" };
	}

	if (!isVotingOpen()) {
		return {
			type: "timeInfo",
			timeInfo: {
				relativeTime: formatDistance(nextVotingRange.startDate, now, {
					addSuffix: true,
				}),
				timestamp: nextVotingRange.startDate.getTime(),
				timing: "starts",
			},
		};
	}

	const usersForVoting = user?.plusTier
		? await PlusVotingRepository.findAllUsersForVoting({
				id: user.id,
				plusTier: user.plusTier,
			})
		: undefined;
	const hasVoted = user
		? await PlusVotingRepository.hasVoted({
				authorId: user.id,
				...rangeToMonthYear(nextVotingRange),
			})
		: false;

	if (!usersForVoting || hasVoted) {
		return {
			type: "timeInfo",
			voted: hasVoted,
			timeInfo: {
				relativeTime: formatDistance(nextVotingRange.endDate, now, {
					addSuffix: true,
				}),
				timestamp: nextVotingRange.endDate.getTime(),
				timing: "ends",
			},
		};
	}

	const cardUserIds = R.unique(
		usersForVoting.flatMap(({ user, suggestion }) => [
			user.id,
			...(suggestion?.entries ?? []).map((entry) => entry.author.id),
		]),
	);

	return {
		type: "voting",
		usersForVoting,
		...(await UserCardRepository.findAllByUserIds({ userIds: cardUserIds })),
		votingEnds: {
			timestamp: nextVotingRange.endDate.getTime(),
			relativeTime: formatDistance(nextVotingRange.endDate, now, {
				addSuffix: true,
			}),
		},
	};
};
