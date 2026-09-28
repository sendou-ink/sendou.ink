import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { LinkButton } from "~/components/elements/Button";
import { Pagination } from "~/components/Pagination";
import { useUser } from "~/features/auth/core/user";
import { UserResultsTable } from "~/features/user-page/components/UserResultsTable";
import { useSearchParamPagination } from "~/hooks/useSearchParamPagination";
import { userResultsEditHighlightsPage } from "~/utils/urls";
import { ResultsFiltersBar } from "../components/ResultsFiltersBar";
import { SubPageHeader } from "../components/SubPageHeader";
import { loader } from "../loaders/u.$identifier.results.server";
import { useUserPageLayoutData } from "../user-page-hooks";
import { userResultsSearchParams } from "../user-page-search-params";

export { loader };

export default function UserResultsPage() {
	const user = useUser();
	const { t } = useTranslation(["user", "common"]);
	const data = useLoaderData<typeof loader>();

	const layoutData = useUserPageLayoutData();

	const pagination = useSearchParamPagination({
		definition: userResultsSearchParams,
		currentPage: data.results.currentPage,
		pagesCount: data.results.pagesCount,
	});

	return (
		<div className="stack lg">
			<SubPageHeader user={layoutData.user} title={t("common:results")}>
				{user?.id === layoutData.user.id ? (
					<LinkButton to={userResultsEditHighlightsPage(user)} size="small">
						{t("results.highlights.choose")}
					</LinkButton>
				) : null}
			</SubPageHeader>
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
