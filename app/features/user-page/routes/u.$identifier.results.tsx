import { useLoaderData, useMatches } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import { LinkButton } from "~/components/elements/Button";
import { useUser } from "~/features/auth/core/user";
import { UserResultsTable } from "~/features/user-page/components/UserResultsTable";
import { useSearchParamState } from "~/hooks/useSearchParamState";
import invariant from "~/utils/invariant";
import { userResultsEditHighlightsPage } from "~/utils/urls";
import { SendouButton } from "../../../components/elements/Button";
import type { UserPageLoaderData } from "../loaders/u.$identifier.server";

import { loader } from "../loaders/u.$identifier.results.server";
export { loader };

export default function UserResultsPage() {
	const user = useUser();
	const { t } = useTranslation("user");
	const data = useLoaderData<typeof loader>();

	const [, parentRoute] = useMatches();
	invariant(parentRoute);
	const layoutData = parentRoute.data as UserPageLoaderData;

	const highlightedResults = data.results.filter(
		(result) => result.isHighlight,
	);
	const hasHighlightedResults = highlightedResults.length > 0;

	const [showAll, setShowAll] = useSearchParamState({
		defaultValue: !hasHighlightedResults,
		name: "all",
		revive: (v) => (!hasHighlightedResults ? true : v === "true"),
	});

	const resultsToShow = showAll ? data.results : highlightedResults;

	return (
		<div className="stack lg">
			<div className="stack horizontal justify-between items-center">
				<h2 className="text-lg">
					{showAll ? t("results.title") : t("results.highlights")}
				</h2>
				{user?.id === layoutData.user.id ? (
					<LinkButton
						to={userResultsEditHighlightsPage(user)}
						className="ml-auto"
						size="small"
					>
						{t("results.highlights.choose")}
					</LinkButton>
				) : null}
			</div>
			<UserResultsTable id="user-results-table" results={resultsToShow} />
			{hasHighlightedResults ? (
				<SendouButton
					variant="minimal"
					size="small"
					onPress={() => setShowAll(!showAll)}
				>
					{showAll
						? t("results.button.showHighlights")
						: t("results.button.showAll")}
				</SendouButton>
			) : null}
		</div>
	);
}
