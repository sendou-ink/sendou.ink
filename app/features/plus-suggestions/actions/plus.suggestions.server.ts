import { redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as PlusSuggestionRepository from "~/features/plus-suggestions/PlusSuggestionRepository.server";
import { plusSuggestionPage } from "~/features/plus-suggestions/plus-suggestions-urls";
import {
	isVotingActive,
	nextNonCompletedVoting,
	rangeToMonthYear,
} from "~/features/plus-voting/core";
import { defineAction } from "~/form/define-action.server";
import { requirePermission } from "~/modules/permissions/guards.server";
import { invariant } from "~/utils/invariant";
import { badRequestIfFalsy } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { suggestionActionSchema } from "../plus-suggestions-schemas";

export const action = defineAction(
	{ body: suggestionActionSchema },
	async ({ body }) => {
		const user = requireUser();

		const votingMonthYear = rangeToMonthYear(
			badRequestIfFalsy(nextNonCompletedVoting(new Date())),
		);

		switch (body._action) {
			case "EDIT_SUGGESTION": {
				const suggestions =
					await PlusSuggestionRepository.findAllByMonth(votingMonthYear);

				const suggestion = suggestions.find((s) =>
					s.entries.some((candidate) => candidate.id === body.suggestionId),
				);
				invariant(suggestion);
				const entry = suggestion.entries.find(
					(e) => e.id === body.suggestionId,
				);
				invariant(entry);

				requirePermission(entry, "EDIT");

				await PlusSuggestionRepository.updateTextById(
					body.suggestionId,
					body.comment,
				);

				throw redirect(plusSuggestionPage({ tier: suggestion.tier }));
			}
			case "DELETE_COMMENT": {
				const suggestions =
					await PlusSuggestionRepository.findAllByMonth(votingMonthYear);

				const suggestionToDelete = suggestions.find((suggestion) =>
					suggestion.entries.some((entry) => entry.id === body.suggestionId),
				);
				invariant(suggestionToDelete);
				const entryToDelete = suggestionToDelete.entries.find(
					(entry) => entry.id === body.suggestionId,
				);
				invariant(entryToDelete);

				requirePermission(entryToDelete, "DELETE");

				const suggestionHasComments = suggestionToDelete.entries.length > 1;

				if (
					suggestionHasComments &&
					suggestionToDelete.entries[0].id === body.suggestionId
				) {
					// admin only action
					await PlusSuggestionRepository.deleteWithCommentsBySuggestedUserId({
						tier: suggestionToDelete.tier,
						userId: suggestionToDelete.suggested.id,
						...votingMonthYear,
					});
				} else {
					await PlusSuggestionRepository.deleteById(body.suggestionId);
				}

				break;
			}
			case "DELETE_SUGGESTION_OF_THEMSELVES": {
				invariant(!isVotingActive(), "Voting is active");

				await PlusSuggestionRepository.deleteWithCommentsBySuggestedUserId({
					tier: body.tier,
					userId: user.id,
					...votingMonthYear,
				});

				break;
			}
			default: {
				assertUnreachable(body);
			}
		}

		return null;
	},
);
