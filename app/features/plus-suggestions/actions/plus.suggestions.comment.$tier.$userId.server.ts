import { redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as PlusSuggestionRepository from "~/features/plus-suggestions/PlusSuggestionRepository.server";
import { plusSuggestionPage } from "~/features/plus-suggestions/plus-suggestions-urls";
import {
	nextNonCompletedVoting,
	rangeToMonthYear,
} from "~/features/plus-voting/core";
import { defineAction } from "~/form/define-action.server";
import { badRequestIfFalsy, errorToastIfFalsy } from "~/utils/remix.server";
import { followUpCommentFormSchema } from "../plus-suggestions-schemas";
import { canAddCommentToSuggestionBE } from "../plus-suggestions-utils";

export const action = defineAction(
	{ body: followUpCommentFormSchema },
	async ({ body }) => {
		const user = requireUser();

		const votingMonthYear = rangeToMonthYear(
			badRequestIfFalsy(nextNonCompletedVoting(new Date())),
		);

		const suggestions =
			await PlusSuggestionRepository.findAllByMonth(votingMonthYear);

		errorToastIfFalsy(
			canAddCommentToSuggestionBE({
				suggestions,
				user,
				suggested: { id: body.suggestedId },
				targetPlusTier: body.tier,
			}),
			"No permissions to add this comment",
		);

		await PlusSuggestionRepository.insert({
			authorId: user.id,
			suggestedId: body.suggestedId,
			text: body.comment,
			tier: body.tier,
			...votingMonthYear,
		});

		throw redirect(plusSuggestionPage({ tier: body.tier }));
	},
);
