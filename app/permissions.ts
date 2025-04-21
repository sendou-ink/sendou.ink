import type { Tables, UserWithPlusTier } from "~/db/tables";
import type * as PlusSuggestionRepository from "~/features/plus-suggestions/PlusSuggestionRepository.server";
import { currentSeason, nextSeason } from "./features/mmr/season";
import { isVotingActive } from "./features/plus-voting/core";
import type { FindMatchById } from "./features/tournament-bracket/queries/findMatchById.server";
import { isAdmin } from "./modules/permissions/utils";
import { allTruthy } from "./utils/arrays";
import { databaseTimestampToDate } from "./utils/dates";

// TODO: move to permissions module and generalize a lot of the logic

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

interface CanSuggestNewUserFEArgs {
	user?: Pick<UserWithPlusTier, "id" | "plusTier">;
	suggestions: PlusSuggestionRepository.FindAllByMonthItem[];
}
export function canSuggestNewUserFE({
	user,
	suggestions,
}: CanSuggestNewUserFEArgs) {
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

interface CanSuggestNewUserBEArgs extends CanSuggestNewUserFEArgs {
	suggested: Pick<UserWithPlusTier, "id" | "plusTier">;
	targetPlusTier: NonNullable<UserWithPlusTier["plusTier"]>;
}
export function canSuggestNewUserBE({
	user,
	suggestions,
	suggested,
	targetPlusTier,
}: CanSuggestNewUserBEArgs) {
	return allTruthy([
		canSuggestNewUserFE({ user, suggestions }),
		!playerAlreadySuggested({ suggestions, suggested, targetPlusTier }),
		targetPlusTierIsSmallerOrEqual({ user, targetPlusTier }),
		!playerAlreadyMember({ suggested, targetPlusTier }),
	]);
}

function isPlusServerMember(user?: Pick<UserWithPlusTier, "plusTier">) {
	return Boolean(user?.plusTier);
}

export function playerAlreadyMember({
	suggested,
	targetPlusTier,
}: Pick<CanSuggestNewUserBEArgs, "suggested" | "targetPlusTier">) {
	return suggested.plusTier && suggested.plusTier <= targetPlusTier;
}

function hasUserSuggestedThisMonth({
	user,
	suggestions,
}: Pick<CanSuggestNewUserFEArgs, "user" | "suggestions">) {
	return suggestions.some(
		(suggestion) => suggestion.suggestions[0].author.id === user?.id,
	);
}

interface CanEditBadgeOwnersArgs {
	user?: Pick<Tables["User"], "id">;
	managers: { id: number }[];
}

export function canEditBadgeOwners({
	user,
	managers,
}: Pick<CanEditBadgeOwnersArgs, "user" | "managers">) {
	if (!user) return false;

	if (isAdmin(user)) return true;

	return managers.some((manager) => manager.id === user.id) || isAdmin(user);
}

interface CanEditCalendarEventArgs {
	user?: Pick<Tables["User"], "id">;
	event: Pick<Tables["CalendarEvent"], "authorId">;
}
export function canEditCalendarEvent({
	user,
	event,
}: CanEditCalendarEventArgs) {
	if (isAdmin(user)) return true;

	return user?.id === event.authorId;
}

export function canDeleteCalendarEvent({
	user,
	event,
	startTime,
}: CanEditCalendarEventArgs & { startTime: Date }) {
	if (isAdmin(user)) return true;

	return user?.id === event.authorId && startTime > new Date();
}

interface CanReportCalendarEventWinnersArgs {
	user?: Pick<Tables["User"], "id">;
	event: Pick<Tables["CalendarEvent"], "authorId">;
	startTimes: number[];
}
export function canReportCalendarEventWinners({
	user,
	event,
	startTimes,
}: CanReportCalendarEventWinnersArgs) {
	return allTruthy([
		canEditCalendarEvent({ user, event }),
		eventStartedInThePast(startTimes),
	]);
}

function eventStartedInThePast(
	startTimes: CanReportCalendarEventWinnersArgs["startTimes"],
) {
	return startTimes.every(
		(startTime) =>
			databaseTimestampToDate(startTime).getTime() < new Date().getTime(),
	);
}

export function canReportTournamentScore({
	match,
	isMemberOfATeamInTheMatch,
	isOrganizer,
}: {
	match: NonNullable<FindMatchById>;
	isMemberOfATeamInTheMatch: boolean;
	isOrganizer: boolean;
}) {
	const matchIsOver =
		match.opponentOne?.result === "win" || match.opponentTwo?.result === "win";

	return !matchIsOver && (isMemberOfATeamInTheMatch || isOrganizer);
}
