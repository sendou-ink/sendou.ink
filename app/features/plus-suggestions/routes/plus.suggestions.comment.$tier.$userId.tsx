import { Form, useMatches, useParams } from "@remix-run/react";
import { Button, LinkButton } from "~/components/Button";
import { Dialog } from "~/components/Dialog";
import { Redirect } from "~/components/Redirect";
import { PlUS_SUGGESTION_COMMENT_MAX_LENGTH } from "~/constants";
import { useUser } from "~/features/auth/core/user";
import { canAddCommentToSuggestionFE } from "~/permissions";
import { atOrError } from "~/utils/arrays";
import { plusSuggestionPage } from "~/utils/urls";
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
		<Dialog isOpen>
			<Form method="post" className="stack md">
				<input type="hidden" name="tier" value={tierSuggestedTo} />
				<input type="hidden" name="suggestedId" value={targetUserId} />
				<h2 className="plus__modal-title">
					{userBeingCommented.suggested.username}&apos;s +{tierSuggestedTo}{" "}
					suggestion
				</h2>
				<CommentTextarea maxLength={PlUS_SUGGESTION_COMMENT_MAX_LENGTH} />
				<div className="plus__modal-buttons">
					<Button type="submit">Submit</Button>
					<LinkButton
						to={plusSuggestionPage()}
						variant="minimal-destructive"
						size="tiny"
					>
						Cancel
					</LinkButton>
				</div>
			</Form>
		</Dialog>
	);
}
