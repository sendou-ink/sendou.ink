import * as PlusSuggestionRepository from "~/features/plus-suggestions/PlusSuggestionRepository.server";
import {
	nextNonCompletedVoting,
	rangeToMonthYear,
} from "~/features/plus-voting/core";

export const loader = async () => {
	const nextVotingRange = nextNonCompletedVoting(new Date());

	if (!nextVotingRange) {
		return { suggestions: [] };
	}

	return {
		suggestions: await PlusSuggestionRepository.findAllByMonth(
			rangeToMonthYear(nextVotingRange),
		),
	};
};
