import type { LoaderFunctionArgs } from "react-router";
import * as R from "remeda";
import { getUser } from "~/features/auth/core/user.server";
import { resolveNotifications } from "~/features/notifications/core/resolve.server";
import * as PlusSuggestionRepository from "~/features/plus-suggestions/PlusSuggestionRepository.server";
import {
	nextNonCompletedVoting,
	rangeToMonthYear,
} from "~/features/plus-voting/core";
import * as UserCardRepository from "~/features/user-card/UserCardRepository.server";
import { ZERO_SUGGESTION_COUNTS } from "../plus-suggestions-constants";
import { plusSuggestionsSearchParams } from "../plus-suggestions-search-params";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const { tier } = plusSuggestionsSearchParams.parse(request);
	const shownTier = Number(tier);

	const nextVotingRange = nextNonCompletedVoting(new Date());

	if (!nextVotingRange) {
		return {
			tier: shownTier,
			suggestions: [],
			summary: {
				suggestionCountsByTier: ZERO_SUGGESTION_COUNTS,
				suggestedForTiers: [],
				hasSuggested: false,
			},
		};
	}

	const user = getUser();
	const monthYear = rangeToMonthYear(nextVotingRange);

	if (user) {
		await resolveNotifications({
			userIds: [user.id],
			type: "PLUS_SUGGESTION_ADDED",
			meta: { tier: shownTier },
		});
	}

	const [suggestions, summary] = await Promise.all([
		PlusSuggestionRepository.findAllByMonth({ ...monthYear, tier: shownTier }),
		PlusSuggestionRepository.findMonthSummary({
			...monthYear,
			userId: user?.id ?? null,
		}),
	]);

	const cardUserIds = R.unique(
		suggestions.flatMap((suggestion) => [
			suggestion.suggested.id,
			...suggestion.entries.map((entry) => entry.author.id),
		]),
	);

	return {
		tier: shownTier,
		suggestions,
		summary,
		...(await UserCardRepository.findAllByUserIds({ userIds: cardUserIds })),
	};
};
