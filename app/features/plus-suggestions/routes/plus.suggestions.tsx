import clsx from "clsx";
import { Trash } from "lucide-react";
import type { MetaFunction, ShouldRevalidateFunction } from "react-router";
import { Link, Outlet, useLoaderData, useSearchParams } from "react-router";
import { Alert } from "~/components/Alert";
import { Avatar } from "~/components/Avatar";
import { Catcher } from "~/components/Catcher";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { RelativeTime } from "~/components/RelativeTime";
import type { Tables } from "~/db/tables";
import { useUser } from "~/features/auth/core/user";
import type * as PlusSuggestionRepository from "~/features/plus-suggestions/PlusSuggestionRepository.server";
import {
	isVotingActive,
	nextNonCompletedVoting,
} from "~/features/plus-voting/core";
import { databaseTimestampToDate } from "~/utils/dates";
import invariant from "~/utils/invariant";
import { metaTags, type SerializeFrom } from "~/utils/remix";
import { userPage } from "~/utils/urls";
import { action } from "../actions/plus.suggestions.server";
import { loader } from "../loaders/plus.suggestions.server";
import styles from "../plus.module.css";
import {
	canAddCommentToSuggestionFE,
	canDeleteComment,
	canSuggestNewUser,
} from "../plus-suggestions-utils";
export { action, loader };

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Plus Server suggestions",
		ogTitle: "Plus Server suggestions",
		description:
			"This season's suggestions to the Plus Server (+1, +2 and +3).",
		location: args.location,
	});
};

export type PlusSuggestionsLoaderData = SerializeFrom<typeof loader>;

export const shouldRevalidate: ShouldRevalidateFunction = ({ formMethod }) => {
	// only reload if form submission not when user changes tabs
	return Boolean(formMethod && formMethod !== "GET");
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
			<div className={styles.container}>
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
							className={clsx(styles.topContainer, {
								[styles.topContainerCentered]: !canSuggestNewUser({
									user,
									suggestions: data.suggestions,
								}),
							})}
						>
							<div className={styles.radios}>
								{[1, 2, 3].map((tier) => {
									const id = String(tier);
									const suggestions = data.suggestions.filter(
										(suggestion) => suggestion.tier === tier,
									);

									return (
										<div key={id} className={styles.radioContainer}>
											<label htmlFor={id} className={styles.radioLabel}>
												+{tier}{" "}
												<span className={styles.usersCount}>
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
								<div className={clsx(styles.suggestedInfoText, "text-center")}>
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
							<SendouButton
								key={tier}
								size="small"
								variant="destructive"
								type="submit"
							>
								Delete
							</SendouButton>
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
			<div className={styles.suggestedUserInfo}>
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
					<LinkButton
						className={styles.commentButton}
						size="small"
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
		user?: Pick<Tables["User"], "id" | "discordId">;
		suggestions: PlusSuggestionRepository.FindAllByMonthItem[];
		tier: string;
		suggested: PlusSuggestionRepository.FindAllByMonthItem["suggested"];
	};
	defaultOpen?: true;
}) {
	return (
		<details open={defaultOpen} className="w-full">
			<summary className={styles.viewCommentsAction}>
				Comments ({suggestion.entries.length})
			</summary>
			<div className="stack sm mt-2">
				{suggestion.entries.map((entry) => {
					return (
						<fieldset key={entry.id} className={styles.comment}>
							<legend>{entry.author.username}</legend>
							{entry.text}
							<div className="stack horizontal xs items-center">
								<span className={styles.commentTime}>
									<RelativeTime
										timestamp={databaseTimestampToDate(
											entry.createdAt,
										).getTime()}
									>
										{entry.createdAtRelative}
									</RelativeTime>
								</span>
								{deleteButtonArgs &&
								canDeleteComment({
									author: entry.author,
									user: deleteButtonArgs.user,
									suggestionId: entry.id,
									suggestions: deleteButtonArgs.suggestions,
								}) ? (
									<CommentDeleteButton
										suggestionId={entry.id}
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
	suggestionId: Tables["PlusSuggestion"]["id"];
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
			<SendouButton
				className={styles.deleteButton}
				icon={<Trash />}
				variant="minimal-destructive"
				aria-label="Delete comment"
			/>
		</FormWithConfirm>
	);
}

export const ErrorBoundary = Catcher;
