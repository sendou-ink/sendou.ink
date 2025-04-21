import type { ActionFunction } from "@remix-run/node";
import { requireUser } from "~/features/auth/core/user.server";
import * as PlusSuggestionRepository from "~/features/plus-suggestions/PlusSuggestionRepository.server";
import {
	isVotingActive,
	nextNonCompletedVoting,
	rangeToMonthYear,
} from "~/features/plus-voting/core";
import invariant from "~/utils/invariant";
import {
	badRequestIfFalsy,
	errorToastIfFalsy,
	parseRequestPayload,
} from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { suggestionActionSchema } from "../plus-suggestions-schemas";
import { canDeleteComment, isFirstSuggestion } from "../plus-suggestions-utils";

export const action: ActionFunction = async ({ request }) => {
	const data = await parseRequestPayload({
		request,
		schema: suggestionActionSchema,
	});
	const user = await requireUser(request);

	const votingMonthYear = rangeToMonthYear(
		badRequestIfFalsy(nextNonCompletedVoting(new Date())),
	);

	switch (data._action) {
		case "DELETE_COMMENT": {
			const suggestions =
				await PlusSuggestionRepository.findAllByMonth(votingMonthYear);

			const suggestionToDelete = suggestions.find((suggestion) =>
				suggestion.suggestions.some(
					(suggestion) => suggestion.id === data.suggestionId,
				),
			);
			invariant(suggestionToDelete);
			const subSuggestion = suggestionToDelete.suggestions.find(
				(suggestion) => suggestion.id === data.suggestionId,
			);
			invariant(subSuggestion);

			errorToastIfFalsy(
				canDeleteComment({
					user,
					author: subSuggestion.author,
					suggestionId: data.suggestionId,
					suggestions,
				}),
				"No permissions to delete this comment",
			);

			const suggestionHasComments = suggestionToDelete.suggestions.length > 1;

			if (
				suggestionHasComments &&
				isFirstSuggestion({ suggestionId: data.suggestionId, suggestions })
			) {
				// admin only action
				await PlusSuggestionRepository.deleteWithCommentsBySuggestedUserId({
					tier: suggestionToDelete.tier,
					userId: suggestionToDelete.suggested.id,
					...votingMonthYear,
				});
			} else {
				await PlusSuggestionRepository.deleteById(data.suggestionId);
			}

			break;
		}
		case "DELETE_SUGGESTION_OF_THEMSELVES": {
			invariant(!isVotingActive(), "Voting is active");

			await PlusSuggestionRepository.deleteWithCommentsBySuggestedUserId({
				tier: data.tier,
				userId: user.id,
				...votingMonthYear,
			});

			break;
		}
		default: {
			assertUnreachable(data);
		}
	}

	return null;
};
