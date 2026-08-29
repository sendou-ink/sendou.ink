import clsx from "clsx";
import { SquarePen, Trash } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { Outlet, useLoaderData } from "react-router";
import { Alert } from "~/components/Alert";
import { Avatar } from "~/components/Avatar";
import { Catcher } from "~/components/Catcher";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { RelativeTime } from "~/components/RelativeTime";
import type { Tables } from "~/db/tables";
import { useUser } from "~/features/auth/core/user";
import type * as PlusSuggestionRepository from "~/features/plus-suggestions/PlusSuggestionRepository.server";
import { plusSuggestionCommentPage } from "~/features/plus-suggestions/plus-suggestions-urls";
import {
	isVotingActive,
	nextNonCompletedVoting,
} from "~/features/plus-voting/core";
import { UserCard } from "~/features/user-card/components/UserCard";
import { SendouForm } from "~/form/SendouForm";
import { hasPermission } from "~/modules/permissions/utils";
import {
	useSearchParam,
	useSearchParamsTyped,
} from "~/modules/search-params/hooks";
import { databaseTimestampToDate } from "~/utils/dates";
import { metaTags, ogPageImage, type SerializeFrom } from "~/utils/remix";
import { action } from "../actions/plus.suggestions.server";
import { loader } from "../loaders/plus.suggestions.server";
import type { PlusTier } from "../plus-suggestions-constants";
import { editSuggestionFormSchema } from "../plus-suggestions-schemas";
import {
	PLUS_TIER_PARAMS,
	type PlusTierParam,
	plusSuggestionsSearchParams,
} from "../plus-suggestions-search-params";
import {
	canAddCommentToSuggestionFE,
	canSuggestNewUser,
} from "../plus-suggestions-utils";
import styles from "./plus.suggestions.module.css";

export { action, loader };

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Plus Server suggestions",
		ogTitle: "Plus Server suggestions",
		description:
			"This season's suggestions to the Plus Server (+1, +2 and +3).",
		image: ogPageImage("plus"),
		location: args.location,
	});
};

export type PlusSuggestionsLoaderData = SerializeFrom<typeof loader>;

export const shouldRevalidate = plusSuggestionsSearchParams.shouldRevalidate;

export default function PlusSuggestionsPage() {
	const data = useLoaderData<PlusSuggestionsLoaderData>();
	const [{ alert }, setSearchParams] = useSearchParamsTyped(
		plusSuggestionsSearchParams,
	);
	const user = useUser();
	const tierVisible = data.tier;

	const handleTierChange = (tier: PlusTierParam) => {
		setSearchParams({ tier });
	};

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
			<EditSuggestionDialog suggestions={data.suggestions} />
			<div className={styles.container}>
				<div className="stack md">
					<SuggestedForInfo />
					{alert ? (
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
									hasSuggestedThisMonth: data.summary.hasSuggested,
								}),
							})}
						>
							<div className={styles.radios}>
								{PLUS_TIER_PARAMS.map((tierParam) => {
									const tier = Number(tierParam);
									const suggestionsCount =
										data.summary.suggestionCountsByTier[tier as PlusTier];

									return (
										<div key={tierParam} className={styles.radioContainer}>
											<label htmlFor={tierParam} className={styles.radioLabel}>
												+{tier}{" "}
												<span className={styles.usersCount}>
													({suggestionsCount})
												</span>
											</label>
											<input
												id={tierParam}
												name="tier"
												type="radio"
												checked={tierVisible === tier}
												onChange={() => handleTierChange(tierParam)}
												data-cy={`plus${tier}-radio`}
											/>
										</div>
									);
								})}
							</div>
						</div>
						<div className="stack lg">
							{data.suggestions.map((suggestion) => (
								<SuggestedUser
									key={`${suggestion.suggested.id}-${tierVisible}`}
									suggestion={suggestion}
									tier={tierVisible}
								/>
							))}
							{data.suggestions.length === 0 ? (
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

function SuggestedForInfo() {
	const data = useLoaderData<PlusSuggestionsLoaderData>();

	const suggestedForTiers = data.summary.suggestedForTiers;

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

	return (
		<div className="stack md">
			<div className={styles.suggestedUserInfo}>
				<h2 className={styles.suggestedUserHeading}>
					<UserCard userId={suggestion.suggested.id}>
						<span className={styles.suggestedUserTrigger}>
							<Avatar user={suggestion.suggested} size="md" />
							<span className={styles.suggestedUsername}>
								{suggestion.suggested.username}
							</span>
						</span>
					</UserCard>
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
						to={plusSuggestionCommentPage({
							tier,
							userId: suggestion.suggested.id,
						})}
						prefetch="intent"
					>
						Comment
					</LinkButton>
				) : null}
			</div>
			<PlusSuggestionComments
				suggestion={suggestion}
				deleteButtonArgs={{
					suggested: suggestion.suggested,
					tier: String(tier),
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
		tier: string;
		suggested: PlusSuggestionRepository.FindAllByMonthItem["suggested"];
	};
	defaultOpen?: true;
}) {
	const { t } = useTranslation(["common"]);
	const user = useUser();
	const [, setEditingSuggestionId] = useSearchParam(
		plusSuggestionsSearchParams,
		"editingSuggestionId",
	);

	return (
		<details open={defaultOpen} className="w-full">
			<summary className={styles.viewCommentsAction}>
				Comments ({suggestion.entries.length})
			</summary>
			<div className="stack sm mt-2">
				{suggestion.entries.map((entry) => {
					return (
						<fieldset key={entry.id} className={styles.comment}>
							<legend>
								<UserCard userId={entry.author.id}>
									{entry.author.username}
								</UserCard>
							</legend>
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
								{entry.updatedAt ? (
									<span className="plus__edited-indicator">
										(
										<RelativeTime
											timestamp={databaseTimestampToDate(
												entry.updatedAt,
											).getTime()}
										>
											edited
										</RelativeTime>
										)
									</span>
								) : null}
								{deleteButtonArgs && hasPermission(entry, "EDIT", user) ? (
									<SendouButton
										className="plus__edit-button"
										icon={<SquarePen />}
										variant="minimal"
										aria-label={t("common:actions.edit")}
										onPress={() => setEditingSuggestionId(entry.id)}
									/>
								) : null}
								{deleteButtonArgs && hasPermission(entry, "DELETE", user) ? (
									<CommentDeleteButton
										suggestionId={entry.id}
										tier={deleteButtonArgs.tier}
										suggestedUsername={deleteButtonArgs.suggested.username}
										isFirstSuggestion={suggestion.entries[0].id === entry.id}
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

function EditSuggestionDialog({
	suggestions,
}: {
	suggestions: PlusSuggestionRepository.FindAllByMonthItem[];
}) {
	const { t } = useTranslation(["common"]);
	const [editingSuggestionId, setEditingSuggestionId] = useSearchParam(
		plusSuggestionsSearchParams,
		"editingSuggestionId",
	);

	const entry =
		typeof editingSuggestionId === "number"
			? findEntryById(suggestions, editingSuggestionId)
			: null;

	const handleClose = () => {
		setEditingSuggestionId(null);
	};

	return (
		<SendouDialog
			isOpen={Boolean(entry)}
			onClose={handleClose}
			heading={t("common:actions.edit")}
		>
			{entry ? (
				<SendouForm
					schema={editSuggestionFormSchema}
					defaultValues={{
						suggestionId: entry.id,
						comment: entry.text,
					}}
				>
					{({ FormField }) => <FormField name="comment" />}
				</SendouForm>
			) : null}
		</SendouDialog>
	);
}

function findEntryById(
	suggestions: PlusSuggestionRepository.FindAllByMonthItem[],
	id: number,
) {
	for (const suggestion of suggestions) {
		for (const entry of suggestion.entries) {
			if (entry.id === id) return entry;
		}
	}
	return null;
}

export const ErrorBoundary = Catcher;
