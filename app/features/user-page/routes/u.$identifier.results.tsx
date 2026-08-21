import { useTranslation } from "react-i18next";
import { useLoaderData, useMatches } from "react-router";
import { LinkButton } from "~/components/elements/Button";
import { Pagination } from "~/components/Pagination";
import { useUser } from "~/features/auth/core/user";
import { UserResultsTable } from "~/features/user-page/components/UserResultsTable";
import { useSearchParamPagination } from "~/hooks/useSearchParamPagination";
import invariant from "~/utils/invariant";
import { userPage, userResultsEditHighlightsPage } from "~/utils/urls";
import { ResultsFiltersBar } from "../components/ResultsFiltersBar";
import { SubPageHeader } from "../components/SubPageHeader";
import { loader } from "../loaders/u.$identifier.results.server";
import type { UserPageLoaderData } from "../loaders/u.$identifier.server";
import { userResultsSearchParams } from "../user-page-search-params";
import styles from "./u.$identifier.results.module.css";

export { loader };

export default function UserResultsPage() {
	const user = useUser();
	const { t } = useTranslation(["user", "common"]);
	const data = useLoaderData<typeof loader>();

	const [, parentRoute] = useMatches();
	invariant(parentRoute);
	const layoutData = parentRoute.loaderData as UserPageLoaderData;

	const pagination = useSearchParamPagination({
		definition: userResultsSearchParams,
		currentPage: data.results.currentPage,
		pagesCount: data.results.pagesCount,
	});

	return (
		<div className="stack lg">
			<SubPageHeader
				user={layoutData.user}
				backTo={userPage(layoutData.user)}
			/>
			{user?.id === layoutData.user.id ? (
				<div className={styles.resultsHeaderActions}>
					<LinkButton to={userResultsEditHighlightsPage(user)} size="small">
						{t("results.highlights.choose")}
					</LinkButton>
				</div>
			) : null}
			<ResultsFiltersBar />
			{data.results.value.length > 0 ? (
				<UserResultsTable
					id="user-results-table"
					results={data.results.value}
				/>
			) : (
				<div className="text-lighter text-sm">{t("common:noResults")}</div>
			)}
			{data.results.pagesCount > 1 ? <Pagination {...pagination} /> : null}
		</div>
	);
}
