import * as PlusSuggestionRepository from "~/features/plus-suggestions/PlusSuggestionRepository.server";
import {
	lastCompletedVoting,
	nextNonCompletedVoting,
	rangeToMonthYear,
} from "~/features/plus-voting/core";
import { defineFactory } from "../core/defineFactory";
import { faker } from "../core/faker";

/**
 * `authorId` suggests `suggestedId` for `tier`. Defaults to the upcoming voting's month, i.e. currently open,
 * or the last voting's while the next season isn't listed yet.
 */
export const { create } = defineFactory({
	defaults: () => ({
		...upcomingVotingMonthYear(),
		tier: 1,
		text: faker.lorem.lines(),
	}),
	insert: PlusSuggestionRepository.insert,
});

function upcomingVotingMonthYear() {
	const now = new Date();
	const range = nextNonCompletedVoting(now);

	return range ? rangeToMonthYear(range) : lastCompletedVoting(now);
}
