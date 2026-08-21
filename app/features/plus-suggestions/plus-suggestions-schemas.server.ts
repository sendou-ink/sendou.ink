import * as v from "valibot";
import * as PlusSuggestionRepository from "~/features/plus-suggestions/PlusSuggestionRepository.server";
import {
	nextNonCompletedVoting,
	rangeToMonthYear,
} from "~/features/plus-voting/core";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { superRefineAsync } from "~/utils/schema";
import { newSuggestionFormSchema } from "./plus-suggestions-schemas";

export const newSuggestionFormSchemaServer = v.pipeAsync(
	newSuggestionFormSchema,
	superRefineAsync(async (data, ctx) => {
		const suggested = await UserRepository.findLeanById(data.userId);
		if (!suggested) return;

		const targetPlusTier = Number(data.tier);

		if (suggested.plusTier && suggested.plusTier <= targetPlusTier) {
			ctx.addIssue({
				message: "forms:errors.plusAlreadyMember",
				path: ["userId"],
			});
			return;
		}

		const voting = nextNonCompletedVoting(new Date());
		if (!voting) return;

		const votingMonthYear = rangeToMonthYear(voting);
		const suggestions =
			await PlusSuggestionRepository.findAllByMonth(votingMonthYear);

		const alreadySuggested = suggestions.some(
			(s) => s.suggested.id === suggested.id && s.tier === targetPlusTier,
		);
		if (alreadySuggested) {
			ctx.addIssue({
				message: "forms:errors.plusAlreadySuggested",
				path: ["userId"],
			});
		}
	}),
);
