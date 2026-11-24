import { SendouDialog } from "~/components/elements/Dialog";
import { useUser } from "~/features/auth/core/user";
import { plusSuggestionPage } from "~/features/plus-suggestions/plus-suggestions-urls";
import { SendouForm } from "~/form/SendouForm";
import { action } from "../actions/plus.suggestions.new.server";
import { loader } from "../loaders/plus.suggestions.new.server";
import { PLUS_TIERS } from "../plus-suggestions-constants";
import { newSuggestionFormSchema } from "../plus-suggestions-schemas";

export { action, loader };

export default function PlusNewSuggestionModalPage() {
	const user = useUser();

	// the loader lets only plus server members through
	const tierOptions = PLUS_TIERS.filter(
		(tier) => tier >= (user?.plusTier ?? Number.POSITIVE_INFINITY),
	).map((tier) => ({
		value: String(tier),
		label: `+${tier}`,
	}));

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
