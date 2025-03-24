import type { ActionFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { requireUser } from "~/features/auth/core/user.server";
import { notify } from "~/features/notifications/core/notify.server";
import * as PlusSuggestionRepository from "~/features/plus-suggestions/PlusSuggestionRepository.server";
import {
	nextNonCompletedVoting,
	rangeToMonthYear,
} from "~/features/plus-voting/core";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { canSuggestNewUserBE } from "~/permissions";
import {
	badRequestIfFalsy,
	errorToastIfFalsy,
	parseRequestPayload,
} from "~/utils/remix.server";
import { plusSuggestionPage } from "~/utils/urls";
import { firstCommentActionSchema } from "../plus-suggestions-schemas";

export const action: ActionFunction = async ({ request }) => {
	const data = await parseRequestPayload({
		request,
		schema: firstCommentActionSchema,
	});

	const suggested = badRequestIfFalsy(
		await UserRepository.findLeanById(data.userId),
	);

	const user = await requireUser(request);

	const votingMonthYear = rangeToMonthYear(
		badRequestIfFalsy(nextNonCompletedVoting(new Date())),
	);
	const suggestions =
		await PlusSuggestionRepository.findAllByMonth(votingMonthYear);

	errorToastIfFalsy(
		canSuggestNewUserBE({
			user,
			suggested,
			targetPlusTier: data.tier,
			suggestions,
		}),
		"No permissions to make this suggestion",
	);

	await PlusSuggestionRepository.create({
		authorId: user.id,
		suggestedId: suggested.id,
		tier: data.tier,
		text: data.comment,
		...votingMonthYear,
	});

	notify({
		userIds: [suggested.id],
		notification: {
			type: "PLUS_SUGGESTION_ADDED",
			meta: {
				tier: data.tier,
			},
		},
	});

	throw redirect(plusSuggestionPage({ tier: data.tier }));
};
