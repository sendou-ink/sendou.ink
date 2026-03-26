import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as PlusSuggestionRepository from "~/features/plus-suggestions/PlusSuggestionRepository.server";
import {
	nextNonCompletedVoting,
	rangeToMonthYear,
} from "~/features/plus-voting/core";
import { parseFormData } from "~/form/parse.server";
import { badRequestIfFalsy, errorToastIfFalsy } from "~/utils/remix.server";
import { plusSuggestionPage } from "~/utils/urls";
import { followUpCommentFormSchema } from "../plus-suggestions-schemas";
import { canAddCommentToSuggestionBE } from "../plus-suggestions-utils";

export const action = async ({ request }: ActionFunctionArgs) => {
	const user = requireUser();

	const result = await parseFormData({
		request,
		schema: followUpCommentFormSchema,
	});

	if (!result.success) {
		return { fieldErrors: result.fieldErrors };
	}

	const votingMonthYear = rangeToMonthYear(
		badRequestIfFalsy(nextNonCompletedVoting(new Date())),
	);

	const suggestions =
		await PlusSuggestionRepository.findAllByMonth(votingMonthYear);

	errorToastIfFalsy(
		canAddCommentToSuggestionBE({
			suggestions,
			user,
			suggested: { id: result.data.suggestedId },
			targetPlusTier: result.data.tier,
		}),
		"No permissions to add this comment",
	);

	await PlusSuggestionRepository.create({
		authorId: user.id,
		suggestedId: result.data.suggestedId,
		text: result.data.comment,
		tier: result.data.tier,
		...votingMonthYear,
	});

	throw redirect(plusSuggestionPage({ tier: result.data.tier }));
};
