import { redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import { notify } from "~/features/notifications/core/notify.server";
import * as PlusSuggestionRepository from "~/features/plus-suggestions/PlusSuggestionRepository.server";
import { plusSuggestionPage } from "~/features/plus-suggestions/plus-suggestions-urls";
import {
	nextNonCompletedVoting,
	rangeToMonthYear,
} from "~/features/plus-voting/core";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { defineAction } from "~/form/define-action.server";
import {
	badRequestIfFalsy,
	errorToastIfFalsy,
	unauthorizedIfFalsy,
} from "~/utils/remix.server";
import { PLUS_TIERS } from "../plus-suggestions-constants";
import { newSuggestionFormSchemaServer } from "../plus-suggestions-schemas.server";
import { canSuggestNewUser } from "../plus-suggestions-utils";

export const action = defineAction(
	{ body: newSuggestionFormSchemaServer },
	async ({ body }) => {
		const user = requireUser();

		const tier = PLUS_TIERS.find(
			(t) =>
				(user.plusTier ?? Number.MAX_SAFE_INTEGER) <= t &&
				t === Number(body.tier),
		);
		errorToastIfFalsy(tier, "Invalid tier selected");

		unauthorizedIfFalsy(user.plusTier && user.plusTier <= tier);

		const suggested = badRequestIfFalsy(
			await UserRepository.findLeanById(body.userId),
		);

		const votingMonthYear = rangeToMonthYear(
			badRequestIfFalsy(nextNonCompletedVoting(new Date())),
		);
		const summary = await PlusSuggestionRepository.findMonthSummary({
			...votingMonthYear,
			userId: user.id,
		});

		errorToastIfFalsy(
			canSuggestNewUser({
				user,
				hasSuggestedThisMonth: summary.hasSuggested,
			}),
			"Can't make a suggestion right now",
		);

		await PlusSuggestionRepository.insert({
			authorId: user.id,
			suggestedId: suggested.id,
			tier,
			text: body.comment,
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
	},
);
