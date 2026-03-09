import { useMatches, useParams } from "react-router";
import { SendouDialog } from "~/components/elements/Dialog";
import { Redirect } from "~/components/Redirect";
import { useUser } from "~/features/auth/core/user";
import { SendouForm } from "~/form/SendouForm";
import { plusSuggestionPage } from "~/utils/urls";
import { action } from "../actions/plus.suggestions.comment.$tier.$userId.server";
import { followUpCommentFormSchema } from "../plus-suggestions-schemas";
import { canAddCommentToSuggestionFE } from "../plus-suggestions-utils";
import type { PlusSuggestionsLoaderData } from "./plus.suggestions";
export { action };

export default function PlusCommentModalPage() {
	const user = useUser();
	const matches = useMatches();
	const params = useParams();
	const data = matches.at(-2)!.data as PlusSuggestionsLoaderData;

	const targetUserId = Number(params.userId);
	const tierSuggestedTo = Number(params.tier);

	const userBeingCommented = data.suggestions.find(
		(suggestion) =>
			suggestion.tier === tierSuggestedTo &&
			suggestion.suggested.id === targetUserId,
	);

	if (
		!data.suggestions ||
		!userBeingCommented ||
		!canAddCommentToSuggestionFE({
			user,
			suggestions: data.suggestions,
			suggested: { id: targetUserId },
			targetPlusTier: tierSuggestedTo,
		})
	) {
		return <Redirect to={plusSuggestionPage()} />;
	}

	return (
		<SendouDialog
			heading={`${userBeingCommented.suggested.username}'s +${tierSuggestedTo} suggestion`}
			onCloseTo={plusSuggestionPage()}
		>
			<SendouForm
				schema={followUpCommentFormSchema}
				defaultValues={{ tier: tierSuggestedTo, suggestedId: targetUserId }}
			>
				{({ FormField }) => <FormField name="comment" />}
			</SendouForm>
		</SendouDialog>
	);
}
