import * as PlusSuggestionRepository from "~/features/plus-suggestions/PlusSuggestionRepository.server";
import {
	nextNonCompletedVoting,
	rangeToMonthYear,
} from "~/features/plus-voting/core";
import invariant from "~/utils/invariant";
import { defineFactory } from "../core/defineFactory";
import { faker } from "../core/faker";

/** `authorId` suggests `suggestedId` for `tier`. Defaults to the upcoming voting's month, i.e. currently open. */
export const { create } = defineFactory({
	defaults: () => ({
		...upcomingVotingMonthYear(),
		tier: 1,
		text: faker.lorem.lines(),
	}),
	insert: PlusSuggestionRepository.insert,
});

function upcomingVotingMonthYear() {
	const range = nextNonCompletedVoting(new Date());
	invariant(range, "No next voting found");

	return rangeToMonthYear(range);
}
