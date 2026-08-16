import { type ActionFunction, redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as PlusSuggestionRepository from "~/features/plus-suggestions/PlusSuggestionRepository.server";
import { plusSuggestionPage } from "~/features/plus-suggestions/plus-suggestions-urls";
import {
	isVotingActive,
	nextNonCompletedVoting,
	rangeToMonthYear,
} from "~/features/plus-voting/core";
import { parseFormData } from "~/form/parse.server";
import { requirePermission } from "~/modules/permissions/guards.server";
import invariant from "~/utils/invariant";
import { badRequestIfFalsy } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { suggestionActionSchema } from "../plus-suggestions-schemas";

export const action: ActionFunction = async ({ request }) => {
	const user = requireUser();

	const votingMonthYear = rangeToMonthYear(
		badRequestIfFalsy(nextNonCompletedVoting(new Date())),
	);

	const result = await parseFormData({
		request,
		schema: suggestionActionSchema,
	});

	if (!result.success) {
		return { fieldErrors: result.fieldErrors };
	}

	const data = result.data;

	switch (data._action) {
		case "EDIT_SUGGESTION": {
			const suggestions =
				await PlusSuggestionRepository.findAllByMonth(votingMonthYear);

			const suggestion = suggestions.find((s) =>
				s.entries.some((entry) => entry.id === data.suggestionId),
			);
			invariant(suggestion);
			const entry = suggestion.entries.find((e) => e.id === data.suggestionId);
			invariant(entry);

			requirePermission(entry, "EDIT");

			await PlusSuggestionRepository.updateTextById(
				data.suggestionId,
				data.comment,
			);

			throw redirect(plusSuggestionPage({ tier: suggestion.tier }));
		}
		case "DELETE_COMMENT": {
			const suggestions =
				await PlusSuggestionRepository.findAllByMonth(votingMonthYear);

			const suggestionToDelete = suggestions.find((suggestion) =>
				suggestion.entries.some((entry) => entry.id === data.suggestionId),
			);
			invariant(suggestionToDelete);
			const entryToDelete = suggestionToDelete.entries.find(
				(entry) => entry.id === data.suggestionId,
			);
			invariant(entryToDelete);

			requirePermission(entryToDelete, "DELETE");

			const suggestionHasComments = suggestionToDelete.entries.length > 1;

			if (
				suggestionHasComments &&
				suggestionToDelete.entries[0].id === data.suggestionId
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
