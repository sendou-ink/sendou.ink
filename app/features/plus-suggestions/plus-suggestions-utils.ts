import type { Tables, UserWithPlusTier } from "~/db/tables";
import type * as PlusSuggestionRepository from "~/features/plus-suggestions/PlusSuggestionRepository.server";
import { isAdmin } from "~/modules/permissions/utils";
import { allTruthy } from "~/utils/arrays";
import { currentSeason, nextSeason } from "../mmr/season";
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

interface CanDeleteCommentArgs {
	suggestionId: Tables["PlusSuggestion"]["id"];
	author: Pick<Tables["User"], "id">;
	user?: Pick<Tables["User"], "id" | "discordId">;
	suggestions: PlusSuggestionRepository.FindAllByMonthItem[];
}
export function canDeleteComment(args: CanDeleteCommentArgs) {
	const votingActive =
		process.env.NODE_ENV === "test" ? false : isVotingActive();

	if (isFirstSuggestion(args)) {
		if (votingActive) return false;
		if (isAdmin(args.user)) return true;

		return allTruthy([isOwnComment(args), suggestionHasNoOtherComments(args)]);
	}

	return isOwnComment(args);
}

export function isFirstSuggestion({
	suggestionId,
	suggestions,
}: Pick<CanDeleteCommentArgs, "suggestionId" | "suggestions">) {
	for (const suggestedUser of Object.values(suggestions).flat()) {
		for (const [i, suggestion] of suggestedUser.suggestions.entries()) {
			if (suggestion.id !== suggestionId) continue;

			return i === 0;
		}
	}

	throw new Error(`Invalid suggestion id: ${suggestionId}`);
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
			suggestion.suggestions.some(
				(suggestion) => suggestion.author.id === user?.id,
			),
	);
}

export function playerAlreadySuggested({
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

function isOwnComment({ author, user }: CanDeleteCommentArgs) {
	return author.id === user?.id;
}

function suggestionHasNoOtherComments({
	suggestions,
	suggestionId,
}: Pick<CanDeleteCommentArgs, "suggestionId" | "suggestions">) {
	for (const suggestedUser of Object.values(suggestions).flat()) {
		for (const suggestion of suggestedUser.suggestions) {
			if (suggestion.id !== suggestionId) continue;

			return suggestedUser.suggestions.length === 1;
		}
	}

	throw new Error(`Invalid suggestion id: ${suggestionId}`);
}

interface CanSuggestNewUserArgs {
	user?: Pick<UserWithPlusTier, "id" | "plusTier">;
	suggestions: PlusSuggestionRepository.FindAllByMonthItem[];
}
export function canSuggestNewUser({
	user,
	suggestions,
}: CanSuggestNewUserArgs) {
	const votingActive =
		process.env.NODE_ENV === "test" ? false : isVotingActive();

	const existsSeason = currentSeason(new Date()) || nextSeason(new Date());

	return allTruthy([
		!votingActive,
		!hasUserSuggestedThisMonth({ user, suggestions }),
		isPlusServerMember(user),
		existsSeason,
	]);
}

function isPlusServerMember(user?: Pick<UserWithPlusTier, "plusTier">) {
	return Boolean(user?.plusTier);
}

export function playerAlreadyMember({
	suggested,
	targetPlusTier,
}: {
	suggested: Pick<UserWithPlusTier, "id" | "plusTier">;
	targetPlusTier: NonNullable<UserWithPlusTier["plusTier"]>;
}) {
	return suggested.plusTier && suggested.plusTier <= targetPlusTier;
}

function hasUserSuggestedThisMonth({
	user,
	suggestions,
}: Pick<CanSuggestNewUserArgs, "user" | "suggestions">) {
	return suggestions.some(
		(suggestion) => suggestion.suggestions[0].author.id === user?.id,
	);
}
