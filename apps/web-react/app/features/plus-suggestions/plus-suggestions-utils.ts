import type { Tables } from "~/db/tables";
import type * as PlusSuggestionRepository from "~/features/plus-suggestions/PlusSuggestionRepository.server";
import { allTruthy } from "~/utils/arrays";
import type { UserWithPlusTier } from "~/utils/kysely.server";
import * as Seasons from "../mmr/core/Seasons";
import { isVotingActive } from "../plus-voting/core";

interface CanAddCommentToSuggestionArgs {
	user?: Pick<UserWithPlusTier, "id" | "plusTier">;
	suggestions: PlusSuggestionRepository.FindAllByMonthItem[];
	suggested: Pick<Tables["User"], "id">;
	targetPlusTier: NonNullable<UserWithPlusTier["plusTier"]>;
}
export function canAddCommentToSuggestionFE(
	args: CanAddCommentToSuggestionArgs,
) {
	return allTruthy([
		!alreadyCommentedByUser(args),
		isPlusServerMember(args.user),
		args.user?.plusTier && args.targetPlusTier >= args.user?.plusTier,
	]);
}

export function canAddCommentToSuggestionBE({
	user,
	suggestions,
	suggested,
	targetPlusTier,
}: CanAddCommentToSuggestionArgs) {
	return allTruthy([
		canAddCommentToSuggestionFE({
			user,
			suggestions,
			suggested,
			targetPlusTier,
		}),
		playerAlreadySuggested({ suggestions, suggested, targetPlusTier }),
		targetPlusTierIsSmallerOrEqual({ user, targetPlusTier }),
	]);
}

function alreadyCommentedByUser({
	user,
	suggestions,
	suggested,
	targetPlusTier,
}: CanAddCommentToSuggestionArgs) {
	return suggestions.some(
		(suggestion) =>
			suggestion.tier === targetPlusTier &&
			suggestion.suggested.id === suggested.id &&
			suggestion.entries.some((entry) => entry.author.id === user?.id),
	);
}

function playerAlreadySuggested({
	suggestions,
	suggested,
	targetPlusTier,
}: Pick<
	CanAddCommentToSuggestionArgs,
	"suggestions" | "suggested" | "targetPlusTier"
>) {
	return suggestions.some(
		(suggestion) =>
			suggestion.suggested.id === suggested.id &&
			suggestion.tier === targetPlusTier,
	);
}

function targetPlusTierIsSmallerOrEqual({
	user,
	targetPlusTier,
}: Pick<CanAddCommentToSuggestionArgs, "user" | "targetPlusTier">) {
	return user?.plusTier && user.plusTier <= targetPlusTier;
}

interface CanSuggestNewUserArgs {
	user?: Pick<UserWithPlusTier, "id" | "plusTier">;
	/** Whether the user has already started a suggestion this month, any tier. */
	hasSuggestedThisMonth: boolean;
}
export function canSuggestNewUser({
	user,
	hasSuggestedThisMonth,
}: CanSuggestNewUserArgs) {
	const votingActive =
		process.env.NODE_ENV === "test" ? false : isVotingActive();

	const existsSeason = Seasons.current() || Seasons.next();

	return allTruthy([
		!votingActive,
		!hasSuggestedThisMonth,
		isPlusServerMember(user),
		existsSeason,
	]);
}

function isPlusServerMember(user?: Pick<UserWithPlusTier, "plusTier">) {
	return Boolean(user?.plusTier);
}
