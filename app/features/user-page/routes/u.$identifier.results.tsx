import { Search } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useLoaderData, useMatches } from "react-router";
import { LinkButton } from "~/components/elements/Button";
import { Input } from "~/components/Input";
import { Pagination } from "~/components/Pagination";
import { useUser } from "~/features/auth/core/user";
import { UserResultsTable } from "~/features/user-page/components/UserResultsTable";
import { useDebounce } from "~/hooks/useDebounce";
import { useSearchParamPagination } from "~/hooks/useSearchParamPagination";
import { useSearchParamsTyped } from "~/modules/search-params/hooks";
import invariant from "~/utils/invariant";
import { userPage, userResultsEditHighlightsPage } from "~/utils/urls";
import { SendouButton } from "../../../components/elements/Button";
import { SubPageHeader } from "../components/SubPageHeader";
import { loader } from "../loaders/u.$identifier.results.server";
import type { UserPageLoaderData } from "../loaders/u.$identifier.server";
import styles from "../user-page.module.css";
import { userResultsSearchParams } from "../user-page-search-params";

export { loader };

export default function UserResultsPage() {
	const user = useUser();
	const { t } = useTranslation("user");
	const data = useLoaderData<typeof loader>();

	const [, parentRoute] = useMatches();
	invariant(parentRoute);
	const layoutData = parentRoute.loaderData as UserPageLoaderData;

	const [{ all: showAll, tournament }, setParams] = useSearchParamsTyped(
		userResultsSearchParams,
	);

	const urlTournamentQuery = tournament ?? "";
	const [tournamentQuery, setTournamentQuery] =
		React.useState(urlTournamentQuery);
	const [prevUrlTournamentQuery, setPrevUrlTournamentQuery] =
		React.useState(urlTournamentQuery);

	if (urlTournamentQuery !== prevUrlTournamentQuery) {
		setPrevUrlTournamentQuery(urlTournamentQuery);
		setTournamentQuery(urlTournamentQuery);
	}

	useDebounce(
		() => {
			if (urlTournamentQuery === tournamentQuery) return;
			setParams({ tournament: tournamentQuery || null });
		},
		300,
		[tournamentQuery],
	);

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
			<div className={styles.resultsHeader}>
				<h2 className="text-lg">
					{showAll || !data.hasHighlightedResults
						? t("results.title")
						: t("results.highlights")}
				</h2>
				<div className={styles.resultsHeaderActions}>
					{user ? (
						<Input
							className={styles.resultsFilterInput}
							value={tournamentQuery}
							onChange={(e) => setTournamentQuery(e.target.value)}
							placeholder={t("results.filter.placeholder")}
							aria-label={t("results.filter.placeholder")}
							icon={<Search />}
						/>
					) : null}
					{user?.id === layoutData.user.id ? (
						<LinkButton to={userResultsEditHighlightsPage(user)} size="small">
							{t("results.highlights.choose")}
						</LinkButton>
					) : null}
				</div>
			</div>
			<UserResultsTable id="user-results-table" results={data.results.value} />
			{data.results.pagesCount > 1 ? <Pagination {...pagination} /> : null}
			{data.hasHighlightedResults ? (
				<SendouButton
					variant="minimal"
					size="small"
					onPress={() => setParams({ all: !showAll })}
				>
					{showAll
						? t("results.button.showHighlights")
						: t("results.button.showAll")}
				</SendouButton>
			) : null}
		</div>
	);
}
