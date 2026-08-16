import { useMatches, useParams } from "react-router";
import { SendouDialog } from "~/components/elements/Dialog";
import { Redirect } from "~/components/Redirect";
import { useUser } from "~/features/auth/core/user";
import {
	plusSuggestionCommentPage,
	plusSuggestionPage,
} from "~/features/plus-suggestions/plus-suggestions-urls";
import { SendouForm } from "~/form/SendouForm";
import { action } from "../actions/plus.suggestions.comment.$tier.$userId.server";
import { isPlusTier } from "../plus-suggestions-constants";
import { followUpCommentFormSchema } from "../plus-suggestions-schemas";
import { canAddCommentToSuggestionFE } from "../plus-suggestions-utils";
import type { PlusSuggestionsLoaderData } from "./plus.suggestions";

export { action };

export default function PlusCommentModalPage() {
	const user = useUser();
	const matches = useMatches();
	const params = useParams();
	const data = matches.at(-2)!.loaderData as PlusSuggestionsLoaderData;

	const targetUserId = Number(params.userId);
	const tierSuggestedTo = Number(params.tier);

	if (!isPlusTier(tierSuggestedTo)) {
		return <Redirect to={plusSuggestionPage()} />;
	}

	// the parent only loads one tier's suggestions, so a link that arrived without
	// the matching tier search param (an old bookmark) is sent through it first
	if (data.tier !== tierSuggestedTo) {
		return (
			<Redirect
				to={plusSuggestionCommentPage({
					tier: tierSuggestedTo,
					userId: targetUserId,
				})}
			/>
		);
	}

	const userBeingCommented = data.suggestions.find(
		(suggestion) => suggestion.suggested.id === targetUserId,
	);

	if (
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
