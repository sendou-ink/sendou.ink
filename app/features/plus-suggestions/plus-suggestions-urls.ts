import {
	type PlusTierParam,
	plusSuggestionsSearchParams,
} from "./plus-suggestions-search-params";

export const plusSuggestionPage = ({
	tier,
	showAlert,
}: {
	tier?: string | number;
	showAlert?: boolean;
} = {}) =>
	plusSuggestionsSearchParams.href("/plus/suggestions", {
		...tierParam(tier),
		alert: Boolean(showAlert),
	});

export const plusSuggestionsNewPage = (tier?: string | number) =>
	plusSuggestionsSearchParams.href("/plus/suggestions/new", tierParam(tier));

export const plusSuggestionCommentPage = ({
	tier,
	userId,
}: {
	tier: string | number;
	userId: number;
}) =>
	plusSuggestionsSearchParams.href(
		`/plus/suggestions/comment/${tier}/${userId}`,
		tierParam(tier),
	);

/** The suggestions page loads one tier at a time, so its links carry the tier. */
const tierParam = (tier?: string | number) =>
	tier ? { tier: String(tier) as PlusTierParam } : {};
