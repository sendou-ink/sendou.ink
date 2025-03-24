import type { ActionFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { requireUser } from "~/features/auth/core/user.server";
import * as PlusSuggestionRepository from "~/features/plus-suggestions/PlusSuggestionRepository.server";
import {
	nextNonCompletedVoting,
	rangeToMonthYear,
} from "~/features/plus-voting/core";
import { canAddCommentToSuggestionBE } from "~/permissions";
import {
	badRequestIfFalsy,
	errorToastIfFalsy,
	parseRequestPayload,
} from "~/utils/remix.server";
import { plusSuggestionPage } from "~/utils/urls";
import { followUpCommentActionSchema } from "../plus-suggestions-schemas";

export const action = async ({ request }: ActionFunctionArgs) => {
	const data = await parseRequestPayload({
		request,
		schema: followUpCommentActionSchema,
	});
	const user = await requireUser(request);

	const votingMonthYear = rangeToMonthYear(
		badRequestIfFalsy(nextNonCompletedVoting(new Date())),
	);

	const suggestions =
		await PlusSuggestionRepository.findAllByMonth(votingMonthYear);

	errorToastIfFalsy(
		canAddCommentToSuggestionBE({
			suggestions,
			user,
			suggested: { id: data.suggestedId },
			targetPlusTier: data.tier,
		}),
		"No permissions to add this comment",
	);

	await PlusSuggestionRepository.create({
		authorId: user.id,
		suggestedId: data.suggestedId,
		text: data.comment,
		tier: data.tier,
		...votingMonthYear,
	});

	throw redirect(plusSuggestionPage({ tier: data.tier }));
};
