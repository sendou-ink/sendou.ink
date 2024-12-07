import type {
	ActionFunction,
	MetaFunction,
	SerializeFrom,
} from "@remix-run/node";
import type { ShouldRevalidateFunction } from "@remix-run/react";
import { Link, Outlet, useLoaderData, useSearchParams } from "@remix-run/react";
import clsx from "clsx";
import { z } from "zod";
import { Alert } from "~/components/Alert";
import { Avatar } from "~/components/Avatar";
import { Button, LinkButton } from "~/components/Button";
import { Catcher } from "~/components/Catcher";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { RelativeTime } from "~/components/RelativeTime";
import { TrashIcon } from "~/components/icons/Trash";
import { PLUS_TIERS } from "~/constants";
import type { PlusSuggestion, User } from "~/db/types";
import { useUser } from "~/features/auth/core/user";
import { requireUser } from "~/features/auth/core/user.server";
import * as PlusSuggestionRepository from "~/features/plus-suggestions/PlusSuggestionRepository.server";
import {
	isVotingActive,
	nextNonCompletedVoting,
	rangeToMonthYear,
} from "~/features/plus-voting/core";
import {
	canAddCommentToSuggestionFE,
	canDeleteComment,
	canSuggestNewUserFE,
	isFirstSuggestion,
} from "~/permissions";
import { databaseTimestampToDate } from "~/utils/dates";
import invariant from "~/utils/invariant";
import {
	badRequestIfFalsy,
	parseRequestPayload,
	validate,
} from "~/utils/remix.server";
import { makeTitle } from "~/utils/strings";
import { assertUnreachable } from "~/utils/types";
import { userPage } from "~/utils/urls";
import { _action, actualNumber } from "~/utils/zod";

export const meta: MetaFunction = () => {
	return [
		{ title: makeTitle("Plus Server suggestions") },
		{
			name: "description",
			content: "This month's suggestions for +1, +2 and +3.",
		},
	];
};

const suggestionActionSchema = z.union([
	z.object({
		_action: _action("DELETE_COMMENT"),
		suggestionId: z.preprocess(actualNumber, z.number()),
	}),
	z.object({
		_action: _action("DELETE_SUGGESTION_OF_THEMSELVES"),
		tier: z.preprocess(
			actualNumber,
			z
				.number()
				.min(Math.min(...PLUS_TIERS))
				.max(Math.max(...PLUS_TIERS)),
		),
	}),
]);

export const action: ActionFunction = async ({ request }) => {
	const data = await parseRequestPayload({
		request,
		schema: suggestionActionSchema,
	});
	const user = await requireUser(request);

	const votingMonthYear = rangeToMonthYear(
		badRequestIfFalsy(nextNonCompletedVoting(new Date())),
	);

	switch (data._action) {
		case "DELETE_COMMENT": {
			const suggestions =
				await PlusSuggestionRepository.findAllByMonth(votingMonthYear);

			const suggestionToDelete = suggestions.find((suggestion) =>
				suggestion.suggestions.some(
					(suggestion) => suggestion.id === data.suggestionId,
				),
			);
			invariant(suggestionToDelete);
			const subSuggestion = suggestionToDelete.suggestions.find(
				(suggestion) => suggestion.id === data.suggestionId,
			);
			invariant(subSuggestion);

			validate(suggestionToDelete);
			validate(
				canDeleteComment({
					user,
					author: subSuggestion.author,
					suggestionId: data.suggestionId,
					suggestions,
				}),
			);

			const suggestionHasComments = suggestionToDelete.suggestions.length > 1;

			if (
				suggestionHasComments &&
				isFirstSuggestion({ suggestionId: data.suggestionId, suggestions })
			) {
				// admin only action
				await PlusSuggestionRepository.deleteWithCommentsBySuggestedUserId({
					tier: suggestionToDelete.tier,
					userId: suggestionToDelete.suggested.id,
					...votingMonthYear,
				});
			} else {
				await PlusSuggestionRepository.deleteById(data.suggestionId);
			}

			break;
		}
		case "DELETE_SUGGESTION_OF_THEMSELVES": {
			invariant(!isVotingActive(), "Voting is active");

			await PlusSuggestionRepository.deleteWithCommentsBySuggestedUserId({
				tier: data.tier,
				userId: user.id,
				...votingMonthYear,
			});

			break;
		}
		default: {
			assertUnreachable(data);
		}
	}

	return null;
};

export type PlusSuggestionsLoaderData = SerializeFrom<typeof loader>;

export const shouldRevalidate: ShouldRevalidateFunction = ({ formMethod }) => {
	// only reload if form submission not when user changes tabs
	return Boolean(formMethod && formMethod !== "GET");
};

export const loader = async () => {
	const nextVotingRange = nextNonCompletedVoting(new Date());

	if (!nextVotingRange) {
		return { suggestions: [] };
	}

	return {
		suggestions: await PlusSuggestionRepository.findAllByMonth(
			rangeToMonthYear(nextVotingRange),
		),
	};
};

export default function PlusSuggestionsPage() {
	const data = useLoaderData<PlusSuggestionsLoaderData>();
	const [searchParams, setSearchParams] = useSearchParams();
	const user = useUser();
	const tierVisible = searchParamsToLegalTier(searchParams);

	const handleTierChange = (tier: string) => {
		setSearchParams({ tier });
	};

	const visibleSuggestions = data.suggestions.filter(
		(suggestion) => suggestion.tier === tierVisible,
	);

	if (!nextNonCompletedVoting(new Date())) {
		return (
			<div className="text-center text-lighter text-sm">
				Suggestions can't be made till next voting date is announced
			</div>
		);
	}

	return (
		<>
			<Outlet />
			<div className="plus__container">
				<div className="stack md">
					<SuggestedForInfo />
					{searchParams.get("alert") === "true" ? (
						<Alert variation="WARNING">
							You do not have permissions to suggest or suggesting is not
							possible right now
						</Alert>
					) : null}
					<div className="stack lg">
						<div
							className={clsx("plus__top-container", {
								"content-centered": !canSuggestNewUserFE({
									user,
									suggestions: data.suggestions,
								}),
							})}
						>
							<div className="plus__radios">
								{[1, 2, 3].map((tier) => {
									const id = String(tier);
									const suggestions = data.suggestions.filter(
										(suggestion) => suggestion.tier === tier,
									);

									return (
										<div key={id} className="plus__radio-container">
											<label htmlFor={id} className="plus__radio-label">
												+{tier}{" "}
												<span className="plus__users-count">
													({suggestions.length})
												</span>
											</label>
											<input
												id={id}
												name="tier"
												type="radio"
												checked={tierVisible === tier}
												onChange={() => handleTierChange(String(tier))}
												data-cy={`plus${tier}-radio`}
											/>
										</div>
									);
								})}
							</div>
						</div>
						<div className="stack lg">
							{visibleSuggestions.map((suggestion) => {
								invariant(tierVisible);
								return (
									<SuggestedUser
										key={`${suggestion.suggested.id}-${tierVisible}`}
										suggestion={suggestion}
										tier={tierVisible}
									/>
								);
							})}
							{visibleSuggestions.length === 0 ? (
								<div className="plus__suggested-info-text text-center">
									No suggestions yet
								</div>
							) : null}
						</div>
					</div>
				</div>
			</div>
		</>
	);
}

function searchParamsToLegalTier(searchParams: URLSearchParams) {
	const tierFromSearchParams = searchParams.get("tier");

	if (tierFromSearchParams === "1") return 1;
	if (tierFromSearchParams === "2") return 2;
	if (tierFromSearchParams === "3") return 3;

	return 1;
}

function SuggestedForInfo() {
	const user = useUser();
	const data = useLoaderData<PlusSuggestionsLoaderData>();

	const suggestedForTiers = data.suggestions
		.filter((suggestion) => suggestion.suggested.id === user?.id)
		.map((suggestion) => suggestion.tier);

	if (suggestedForTiers.length === 0) return null;

	return (
		<div className="stack md">
			{!isVotingActive() ? (
				<div className="stack horizontal md">
					{suggestedForTiers.map((tier) => (
						<FormWithConfirm
							key={tier}
							fields={[
								["_action", "DELETE_SUGGESTION_OF_THEMSELVES"],
								["tier", tier],
							]}
							dialogHeading={`Delete your suggestion to +${tier}? You won't appear in next voting.`}
						>
							<Button
								key={tier}
								size="tiny"
								variant="destructive"
								type="submit"
							>
								Delete your +{tier} suggestion
							</Button>
						</FormWithConfirm>
					))}
				</div>
			) : null}
		</div>
	);
}

function SuggestedUser({
	suggestion,
	tier,
}: {
	suggestion: PlusSuggestionRepository.FindAllByMonthItem;
	tier: number;
}) {
	const data = useLoaderData<PlusSuggestionsLoaderData>();
	const user = useUser();

	invariant(data.suggestions);

	return (
		<div className="stack md">
			<div className="plus__suggested-user-info">
				<Avatar user={suggestion.suggested} size="md" />
				<h2>
					<Link className="all-unset" to={userPage(suggestion.suggested)}>
						{suggestion.suggested.username}
					</Link>
				</h2>
				{canAddCommentToSuggestionFE({
					user,
					suggestions: data.suggestions,
					suggested: { id: suggestion.suggested.id },
					targetPlusTier: Number(tier),
				}) ? (
					// TODO: resetScroll={false} https://twitter.com/ryanflorence/status/1527775882797907969
					<LinkButton
						className="plus__comment-button"
						size="tiny"
						variant="outlined"
						to={`comment/${tier}/${suggestion.suggested.id}?tier=${tier}`}
						prefetch="render"
					>
						Comment
					</LinkButton>
				) : null}
			</div>
			<PlusSuggestionComments
				suggestion={suggestion}
				deleteButtonArgs={{
					suggested: suggestion.suggested,
					user,
					tier: String(tier),
					suggestions: data.suggestions,
				}}
			/>
		</div>
	);
}

export function PlusSuggestionComments({
	suggestion,
	deleteButtonArgs,
	defaultOpen,
}: {
	suggestion: PlusSuggestionRepository.FindAllByMonthItem;
	deleteButtonArgs?: {
		user?: Pick<User, "id" | "discordId">;
		suggestions: PlusSuggestionRepository.FindAllByMonthItem[];
		tier: string;
		suggested: PlusSuggestionRepository.FindAllByMonthItem["suggested"];
	};
	defaultOpen?: true;
}) {
	return (
		<details open={defaultOpen} className="w-full">
			<summary className="plus__view-comments-action">
				Comments ({suggestion.suggestions.length})
			</summary>
			<div className="stack sm mt-2">
				{suggestion.suggestions.map((suggestion) => {
					return (
						<fieldset key={suggestion.id} className="plus__comment">
							<legend>{suggestion.author.username}</legend>
							{suggestion.text}
							<div className="stack horizontal xs items-center">
								<span className="plus__comment-time">
									<RelativeTime
										timestamp={databaseTimestampToDate(
											suggestion.createdAt,
										).getTime()}
									>
										{suggestion.createdAtRelative}
									</RelativeTime>
								</span>
								{deleteButtonArgs &&
								canDeleteComment({
									author: suggestion.author,
									user: deleteButtonArgs.user,
									suggestionId: suggestion.id,
									suggestions: deleteButtonArgs.suggestions,
								}) ? (
									<CommentDeleteButton
										suggestionId={suggestion.id}
										tier={deleteButtonArgs.tier}
										suggestedUsername={deleteButtonArgs.suggested.username}
										isFirstSuggestion={
											deleteButtonArgs.suggestions.length === 1
										}
									/>
								) : null}
							</div>
						</fieldset>
					);
				})}
			</div>
		</details>
	);
}

function CommentDeleteButton({
	suggestionId,
	tier,
	suggestedUsername,
	isFirstSuggestion = false,
}: {
	suggestionId: PlusSuggestion["id"];
	tier: string;
	suggestedUsername: string;
	isFirstSuggestion?: boolean;
}) {
	return (
		<FormWithConfirm
			fields={[
				["suggestionId", suggestionId],
				["_action", "DELETE_COMMENT"],
			]}
			dialogHeading={
				isFirstSuggestion
					? `Delete your suggestion of ${suggestedUsername} to +${tier}?`
					: `Delete your comment to ${suggestedUsername}'s +${tier} suggestion?`
			}
		>
			<Button
				className="plus__delete-button"
				icon={<TrashIcon />}
				variant="minimal-destructive"
				aria-label="Delete comment"
			/>
		</FormWithConfirm>
	);
}

export const ErrorBoundary = Catcher;
