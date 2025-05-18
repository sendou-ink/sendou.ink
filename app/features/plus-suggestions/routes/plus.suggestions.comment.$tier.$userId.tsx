import { Form, useMatches, useParams } from "@remix-run/react";
import { Button } from "~/components/Button";
import { Redirect } from "~/components/Redirect";
import { SendouDialog } from "~/components/elements/Dialog";
import { PlUS_SUGGESTION_COMMENT_MAX_LENGTH } from "~/constants";
import { useUser } from "~/features/auth/core/user";
import { atOrError } from "~/utils/arrays";
import { plusSuggestionPage } from "~/utils/urls";
import { canAddCommentToSuggestionFE } from "../plus-suggestions-utils";
import type { PlusSuggestionsLoaderData } from "./plus.suggestions";
import { CommentTextarea } from "./plus.suggestions.new";

import { action } from "../actions/plus.suggestions.comment.$tier.$userId.server";
export { action };

export default function PlusCommentModalPage() {
	const user = useUser();
	const matches = useMatches();
	const params = useParams();
	const data = atOrError(matches, -2).data as PlusSuggestionsLoaderData;

	const targetUserId = Number(params.userId);
	const tierSuggestedTo = String(params.tier);

	const userBeingCommented = data.suggestions.find(
		(suggestion) =>
			suggestion.tier === Number(tierSuggestedTo) &&
			suggestion.suggested.id === targetUserId,
	);

	if (
		!data.suggestions ||
		!userBeingCommented ||
		!canAddCommentToSuggestionFE({
			user,
			suggestions: data.suggestions,
			suggested: { id: targetUserId },
			targetPlusTier: Number(tierSuggestedTo),
		})
	) {
		return <Redirect to={plusSuggestionPage()} />;
	}

	return (
		<SendouDialog
			heading={`${userBeingCommented.suggested.username}'s +${tierSuggestedTo} suggestion`}
			onCloseTo={plusSuggestionPage()}
		>
			<Form method="post" className="stack md">
				<input type="hidden" name="tier" value={tierSuggestedTo} />
				<input type="hidden" name="suggestedId" value={targetUserId} />
				<CommentTextarea maxLength={PlUS_SUGGESTION_COMMENT_MAX_LENGTH} />
				<div>
					<Button type="submit">Submit</Button>
				</div>
			</Form>
		</SendouDialog>
	);
}
