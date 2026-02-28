import { type ActionFunctionArgs, redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import { notify } from "~/features/notifications/core/notify.server";
import * as PlusSuggestionRepository from "~/features/plus-suggestions/PlusSuggestionRepository.server";
import {
	nextNonCompletedVoting,
	rangeToMonthYear,
} from "~/features/plus-voting/core";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { parseFormData } from "~/form/parse.server";
import {
	badRequestIfFalsy,
	errorToastIfFalsy,
	unauthorizedIfFalsy,
} from "~/utils/remix.server";
import { plusSuggestionPage } from "~/utils/urls";
import { PLUS_TIERS } from "../plus-suggestions-constants";
import { newSuggestionFormSchemaServer } from "../plus-suggestions-schemas.server";
import { canSuggestNewUser } from "../plus-suggestions-utils";

export const action = async ({ request }: ActionFunctionArgs) => {
	const user = requireUser();

	const result = await parseFormData({
		request,
		schema: newSuggestionFormSchemaServer,
	});

	if (!result.success) {
		return { fieldErrors: result.fieldErrors };
	}

	const tier = PLUS_TIERS.find(
		(t) =>
			(user.plusTier ?? Number.MAX_SAFE_INTEGER) <= t &&
			t === Number(result.data.tier),
	);
	errorToastIfFalsy(tier, "Invalid tier selected");

	unauthorizedIfFalsy(user.plusTier && user.plusTier <= tier);

	const suggested = badRequestIfFalsy(
		await UserRepository.findLeanById(result.data.userId),
	);

	const votingMonthYear = rangeToMonthYear(
		badRequestIfFalsy(nextNonCompletedVoting(new Date())),
	);
	const suggestions =
		await PlusSuggestionRepository.findAllByMonth(votingMonthYear);

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
		tier,
		text: result.data.comment,
		...votingMonthYear,
	});

	notify({
		userIds: [suggested.id],
		notification: {
			type: "PLUS_SUGGESTION_ADDED",
			meta: {
				tier,
			},
		},
	});

	throw redirect(plusSuggestionPage({ tier }));
};
