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
import {
	badRequestIfFalsy,
	errorToastIfFalsy,
	parseRequestPayload,
	unauthorizedIfFalsy,
} from "~/utils/remix.server";
import { plusSuggestionPage } from "~/utils/urls";
import { firstCommentActionSchema } from "../plus-suggestions-schemas";
import {
	canSuggestNewUser,
	playerAlreadyMember,
	playerAlreadySuggested,
} from "../plus-suggestions-utils";

export const action: ActionFunction = async ({ request }) => {
	const user = await requireUser(request);

	const data = await parseRequestPayload({
		request,
		schema: firstCommentActionSchema,
	});

	unauthorizedIfFalsy(user.plusTier && user.plusTier <= data.tier);

	const suggested = badRequestIfFalsy(
		await UserRepository.findLeanById(data.userId),
	);

	const votingMonthYear = rangeToMonthYear(
		badRequestIfFalsy(nextNonCompletedVoting(new Date())),
	);
	const suggestions =
		await PlusSuggestionRepository.findAllByMonth(votingMonthYear);

	errorToastIfFalsy(
		!playerAlreadySuggested({
			suggestions,
			suggested,
			targetPlusTier: data.tier,
		}),
		"This user has already been suggested",
	);

	errorToastIfFalsy(
		!playerAlreadyMember({ suggested, targetPlusTier: data.tier }),
		"This user is already a member of this tier",
	);

	errorToastIfFalsy(
		canSuggestNewUser({
			user,
			suggestions,
		}),
		"Can't make a suggestion right now",
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
