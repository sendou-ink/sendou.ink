import { redirect } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import * as PlusSuggestionRepository from "~/features/plus-suggestions/PlusSuggestionRepository.server";
import { plusSuggestionPage } from "~/features/plus-suggestions/plus-suggestions-urls";
import {
	nextNonCompletedVoting,
	rangeToMonthYear,
} from "~/features/plus-voting/core";
import { canSuggestNewUser } from "../plus-suggestions-utils";

export const loader = async () => {
	const user = getUser();

	const nextVotingRange = nextNonCompletedVoting(new Date());
	const hasSuggestedThisMonth =
		user && nextVotingRange
			? (
					await PlusSuggestionRepository.findMonthSummary({
						...rangeToMonthYear(nextVotingRange),
						userId: user.id,
					})
				).hasSuggested
			: false;

	if (!canSuggestNewUser({ user, hasSuggestedThisMonth })) {
		throw redirect(plusSuggestionPage({ showAlert: true }));
	}

	return null;
};
