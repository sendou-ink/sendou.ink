import type { ActionFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useMatches } from "@remix-run/react";
import * as React from "react";
import { z } from "zod";
import { LinkButton } from "~/components/Button";
import { Dialog } from "~/components/Dialog";
import { FormMessage } from "~/components/FormMessage";
import { Label } from "~/components/Label";
import { Redirect } from "~/components/Redirect";
import { SubmitButton } from "~/components/SubmitButton";
import { UserSearch } from "~/components/UserSearch";
import {
	PLUS_TIERS,
	PlUS_SUGGESTION_FIRST_COMMENT_MAX_LENGTH,
} from "~/constants";
import type { UserWithPlusTier } from "~/db/types";
import { useUser } from "~/features/auth/core/user";
import { requireUser } from "~/features/auth/core/user.server";
import * as PlusSuggestionRepository from "~/features/plus-suggestions/PlusSuggestionRepository.server";
import {
	nextNonCompletedVoting,
	rangeToMonthYear,
} from "~/features/plus-voting/core";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import {
	canSuggestNewUserBE,
	canSuggestNewUserFE,
	playerAlreadyMember,
	playerAlreadySuggested,
} from "~/permissions";
import { atOrError } from "~/utils/arrays";
import {
	badRequestIfFalsy,
	parseRequestPayload,
	validate,
} from "~/utils/remix.server";
import { plusSuggestionPage } from "~/utils/urls";
import { actualNumber, trimmedString } from "~/utils/zod";
import type { PlusSuggestionsLoaderData } from "./plus.suggestions";

const commentActionSchema = z.object({
	tier: z.preprocess(
		actualNumber,
		z
			.number()
			.min(Math.min(...PLUS_TIERS))
			.max(Math.max(...PLUS_TIERS)),
	),
	comment: z.preprocess(
		trimmedString,
		z.string().min(1).max(PlUS_SUGGESTION_FIRST_COMMENT_MAX_LENGTH),
	),
	userId: z.preprocess(actualNumber, z.number().positive()),
});

export const action: ActionFunction = async ({ request }) => {
	const data = await parseRequestPayload({
		request,
		schema: commentActionSchema,
	});

	const suggested = badRequestIfFalsy(
		await UserRepository.findLeanById(data.userId),
	);

	const user = await requireUser(request);

	const votingMonthYear = rangeToMonthYear(
		badRequestIfFalsy(nextNonCompletedVoting(new Date())),
	);
	const suggestions =
		await PlusSuggestionRepository.findAllByMonth(votingMonthYear);

	validate(suggestions);
	validate(
		canSuggestNewUserBE({
			user,
			suggested,
			targetPlusTier: data.tier,
			suggestions,
		}),
	);

	await PlusSuggestionRepository.create({
		authorId: user.id,
		suggestedId: suggested.id,
		tier: data.tier,
		text: data.comment,
		...votingMonthYear,
	});

	throw redirect(plusSuggestionPage({ tier: data.tier }));
};

export default function PlusNewSuggestionModalPage() {
	const user = useUser();
	const matches = useMatches();
	const data = atOrError(matches, -2).data as PlusSuggestionsLoaderData;
	const [selectedUser, setSelectedUser] = React.useState<{
		/** User id */
		value: string;
		plusTier: number | null;
	} | null>(null);

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
		!canSuggestNewUserFE({
			user,
			suggestions: data.suggestions,
		}) ||
		!targetPlusTier
	) {
		return <Redirect to={plusSuggestionPage({ showAlert: true })} />;
	}

	const selectedUserErrorMessage = getSelectedUserErrorMessage({
		suggested: selectedUser
			? { id: Number(selectedUser.value), plusTier: selectedUser.plusTier }
			: undefined,
		suggestions: data.suggestions,
		targetPlusTier,
	});

	return (
		<Dialog isOpen>
			<Form method="post" className="stack md">
				<h2 className="plus__modal-title">Adding a new suggestion</h2>
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
				<div>
					<label htmlFor="user">Suggested user</label>
					<UserSearch
						inputName="userId"
						onChange={(user) =>
							setSelectedUser({
								plusTier: user.plusTier,
								value: String(user.id),
							})
						}
						required
					/>
					{selectedUserErrorMessage ? (
						<FormMessage type="error">{selectedUserErrorMessage}</FormMessage>
					) : null}
				</div>
				<CommentTextarea maxLength={PlUS_SUGGESTION_FIRST_COMMENT_MAX_LENGTH} />
				<div className="plus__modal-buttons">
					<SubmitButton disabled={Boolean(selectedUserErrorMessage)}>
						Submit
					</SubmitButton>
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

function getSelectedUserErrorMessage({
	suggestions,
	targetPlusTier,
	suggested,
}: {
	suggestions: NonNullable<PlusSuggestionsLoaderData["suggestions"]>;
	targetPlusTier: number;
	suggested?: Pick<UserWithPlusTier, "id" | "plusTier">;
}) {
	if (!suggested) return;

	if (
		playerAlreadyMember({
			suggested,
			targetPlusTier,
		})
	) {
		return `This user already has access to +${targetPlusTier}`;
	}
	if (playerAlreadySuggested({ targetPlusTier, suggestions, suggested })) {
		return `This user was already suggested to +${targetPlusTier}`;
	}

	return;
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
