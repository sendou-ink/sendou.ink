import type { ActionFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useMatches, useParams } from "@remix-run/react";
import { z } from "zod";
import { Button, LinkButton } from "~/components/Button";
import { Dialog } from "~/components/Dialog";
import { Redirect } from "~/components/Redirect";
import { PLUS_TIERS, PlUS_SUGGESTION_COMMENT_MAX_LENGTH } from "~/constants";
import { useUser } from "~/features/auth/core/user";
import { requireUser } from "~/features/auth/core/user.server";
import * as PlusSuggestionRepository from "~/features/plus-suggestions/PlusSuggestionRepository.server";
import {
	nextNonCompletedVoting,
	rangeToMonthYear,
} from "~/features/plus-voting/core";
import {
	canAddCommentToSuggestionBE,
	canAddCommentToSuggestionFE,
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
import { CommentTextarea } from "./plus.suggestions.new";

const commentActionSchema = z.object({
	comment: z.preprocess(
		trimmedString,
		z.string().min(1).max(PlUS_SUGGESTION_COMMENT_MAX_LENGTH),
	),
	tier: z.preprocess(
		actualNumber,
		z
			.number()
			.min(Math.min(...PLUS_TIERS))
			.max(Math.max(...PLUS_TIERS)),
	),
	suggestedId: z.preprocess(actualNumber, z.number()),
});

export const action: ActionFunction = async ({ request }) => {
	const data = await parseRequestPayload({
		request,
		schema: commentActionSchema,
	});
	const user = await requireUser(request);

	const votingMonthYear = rangeToMonthYear(
		badRequestIfFalsy(nextNonCompletedVoting(new Date())),
	);

	const suggestions =
		await PlusSuggestionRepository.findAllByMonth(votingMonthYear);

	validate(suggestions);
	validate(
		canAddCommentToSuggestionBE({
			suggestions,
			user,
			suggested: { id: data.suggestedId },
			targetPlusTier: data.tier,
		}),
	);

	await PlusSuggestionRepository.create({
		authorId: user.id,
		suggestedId: data.suggestedId,
		text: data.comment,
		tier: data.tier,
		...votingMonthYear,
	});

	throw redirect(plusSuggestionPage({ tier: data.tier }));
};

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
