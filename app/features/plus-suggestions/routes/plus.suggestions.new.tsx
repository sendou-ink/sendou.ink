import { Form, useMatches } from "@remix-run/react";
import * as React from "react";
import { Label } from "~/components/Label";
import { Redirect } from "~/components/Redirect";
import { SubmitButton } from "~/components/SubmitButton";
import { SendouDialog } from "~/components/elements/Dialog";
import { UserSearch } from "~/components/elements/UserSearch";
import { useUser } from "~/features/auth/core/user";
import { atOrError } from "~/utils/arrays";
import { plusSuggestionPage } from "~/utils/urls";
import { PLUS_SUGGESTION, PLUS_TIERS } from "../plus-suggestions-constants";
import { canSuggestNewUser } from "../plus-suggestions-utils";
import type { PlusSuggestionsLoaderData } from "./plus.suggestions";

import { action } from "../actions/plus.suggestions.new.server";
export { action };

export default function PlusNewSuggestionModalPage() {
	const user = useUser();
	const matches = useMatches();
	const data = atOrError(matches, -2).data as PlusSuggestionsLoaderData;

	const tierOptions = PLUS_TIERS.filter((tier) => {
		// user will be redirected anyway
		if (!user?.plusTier) return true;

		return tier >= user.plusTier;
	});
	const [targetPlusTier, setTargetPlusTier] = React.useState<
		number | undefined
	>(tierOptions[0]);

	if (
		!data.suggestions ||
		!canSuggestNewUser({
			user,
			suggestions: data.suggestions,
		}) ||
		!targetPlusTier
	) {
		return <Redirect to={plusSuggestionPage({ showAlert: true })} />;
	}

	return (
		<SendouDialog
			heading="Adding a new suggestion"
			onCloseTo={plusSuggestionPage()}
		>
			<Form method="post" className="stack md">
				<div>
					<label htmlFor="tier">Tier</label>
					<select
						id="tier"
						name="tier"
						className="plus__modal-select"
						value={targetPlusTier}
						onChange={(e) => setTargetPlusTier(Number(e.target.value))}
					>
						{tierOptions.map((tier) => (
							<option key={tier} value={tier}>
								+{tier}
							</option>
						))}
					</select>
				</div>
				<UserSearch name="userId" label="Suggested user" isRequired />
				<CommentTextarea maxLength={PLUS_SUGGESTION.FIRST_COMMENT_MAX_LENGTH} />
				<div>
					<SubmitButton>Submit</SubmitButton>
				</div>
			</Form>
		</SendouDialog>
	);
}

export function CommentTextarea({ maxLength }: { maxLength: number }) {
	const [value, setValue] = React.useState("");

	const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		const value = e.target.value;
		setValue(value);

		// Custom validity errors

		const trimmedLength = value.trim().length;

		if (trimmedLength === 0 && value.length !== 0) {
			// value.length === 0 is already validated by the browser due to "required"
			e.target.setCustomValidity("Comment must contain more than whitespace");
		} else if (trimmedLength > maxLength) {
			e.target.setCustomValidity("Comment is too long");
		} else {
			// Important: Reset custom errors if value is valid
			e.target.setCustomValidity("");
		}
	};

	return (
		<div>
			<Label
				htmlFor="comment"
				valueLimits={{
					current: value.trim().length,
					max: maxLength,
				}}
			>
				Your comment
			</Label>
			<textarea
				id="comment"
				name="comment"
				className="plus__modal-textarea"
				rows={4}
				value={value}
				onChange={handleChange}
				required
			/>
		</div>
	);
}
