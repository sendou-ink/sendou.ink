import type { LoaderFunction } from "@remix-run/node";
import { formatDistanceWithI18n } from '~/utils/formatDistanceWithI18n';
import { getUser } from "~/features/auth/core/user.server";
import {
	nextNonCompletedVoting,
	rangeToMonthYear,
} from "~/features/plus-voting/core";
import { isVotingActive } from "~/features/plus-voting/core/voting-time";
import * as PlusVotingRepository from "~/features/plus-voting/PlusVotingRepository.server";
import i18next from "~/modules/i18n/i18next.server";

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
			votingEnds: {
				timestamp: number;
				relativeTime: string;
			};
	  };

export const loader: LoaderFunction = async ({ request }) => {
	const user = await getUser(request);

	const now = new Date();
	const nextVotingRange = nextNonCompletedVoting(now);
	const locale = await i18next.getLocale(request);


	if (!nextVotingRange) {
		return { type: "noTimeDefinedInfo" };
	}

	if (!isVotingActive()) {
		return {
			type: "timeInfo",
			timeInfo: {
				relativeTime: formatDistanceWithI18n(nextVotingRange.startDate, now, locale, {
					addSuffix: true,
				}),
				timestamp: nextVotingRange.startDate.getTime(),
				timing: "starts",
			},
		};
	}

	const usersForVoting = user?.plusTier
		? await PlusVotingRepository.usersForVoting({
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
				relativeTime: formatDistanceWithI18n(nextVotingRange.endDate, now, locale,{
					addSuffix: true,
				}),
				timestamp: nextVotingRange.endDate.getTime(),
				timing: "ends",
			},
		};
	}

	return {
		type: "voting",
		usersForVoting,
		votingEnds: {
			timestamp: nextVotingRange.endDate.getTime(),
			relativeTime: formatDistanceWithI18n(nextVotingRange.endDate, now, locale,{
				addSuffix: true,
			}),
		},
	};
};
