import { useMatches } from "react-router";
import { SendouDialog } from "~/components/elements/Dialog";
import { Redirect } from "~/components/Redirect";
import { useUser } from "~/features/auth/core/user";
import { SendouForm } from "~/form/SendouForm";
import { plusSuggestionPage } from "~/utils/urls";
import { action } from "../actions/plus.suggestions.new.server";
import { PLUS_TIERS } from "../plus-suggestions-constants";
import { newSuggestionFormSchema } from "../plus-suggestions-schemas";
import { canSuggestNewUser } from "../plus-suggestions-utils";
import type { PlusSuggestionsLoaderData } from "./plus.suggestions";
export { action };

export default function PlusNewSuggestionModalPage() {
	const user = useUser();
	const matches = useMatches();
	const data = matches.at(-2)!.data as PlusSuggestionsLoaderData;

	const tierOptions = PLUS_TIERS.filter((tier) => {
		// user will be redirected anyway
		if (!user?.plusTier) return true;

		return tier >= user.plusTier;
	}).map((tier) => ({
		value: String(tier),
		label: `+${tier}`,
	}));

	if (
		!data.suggestions ||
		!canSuggestNewUser({
			user,
			suggestions: data.suggestions,
		}) ||
		tierOptions.length === 0
	) {
		return <Redirect to={plusSuggestionPage({ showAlert: true })} />;
	}

	return (
		<SendouDialog
			heading="Adding a new suggestion"
			onCloseTo={plusSuggestionPage()}
		>
			<SendouForm
				schema={newSuggestionFormSchema}
				defaultValues={{ tier: tierOptions[0].value }}
			>
				{({ FormField }) => (
					<>
						<FormField name="tier" options={tierOptions} />
						<FormField name="userId" />
						<FormField name="comment" />
					</>
				)}
			</SendouForm>
		</SendouDialog>
	);
}
