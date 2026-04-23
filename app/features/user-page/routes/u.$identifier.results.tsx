import { Search } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useLoaderData, useMatches, useSearchParams } from "react-router";
import { useDebounce } from "react-use";
import { LinkButton } from "~/components/elements/Button";
import { Input } from "~/components/Input";
import { Pagination } from "~/components/Pagination";
import { useUser } from "~/features/auth/core/user";
import { UserResultsTable } from "~/features/user-page/components/UserResultsTable";
import invariant from "~/utils/invariant";
import { userPage, userResultsEditHighlightsPage } from "~/utils/urls";
import { SendouButton } from "../../../components/elements/Button";
import { SubPageHeader } from "../components/SubPageHeader";
import { loader } from "../loaders/u.$identifier.results.server";
import type { UserPageLoaderData } from "../loaders/u.$identifier.server";
import styles from "../user-page.module.css";

export { loader };

export default function UserResultsPage() {
	const user = useUser();
	const { t } = useTranslation("user");
	const data = useLoaderData<typeof loader>();

	const [, parentRoute] = useMatches();
	invariant(parentRoute);
	const layoutData = parentRoute.data as UserPageLoaderData;

	const [searchParams, setSearchParams] = useSearchParams();
	const showAll = searchParams.get("all") === "true";

	const urlTournamentQuery = searchParams.get("tournament") ?? "";
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
			setSearchParams((params) => {
				if (tournamentQuery) {
					params.set("tournament", tournamentQuery);
				} else {
					params.delete("tournament");
				}
				params.delete("page");
				return params;
			});
		},
		300,
		[tournamentQuery],
	);

	const setPage = (page: number) => {
		setSearchParams((params) => {
			params.set("page", String(page));
			return params;
		});
	};

	return (
		<div className="stack lg">
			<SubPageHeader
				user={layoutData.user}
				backTo={userPage(layoutData.user)}
			/>
			<div className="stack horizontal justify-between items-center">
				<h2 className="text-lg">
					{showAll || !data.hasHighlightedResults
						? t("results.title")
						: t("results.highlights")}
				</h2>
				<div className="stack horizontal sm items-center">
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
			{data.results.pages > 1 ? (
				<Pagination
					currentPage={data.results.currentPage}
					pagesCount={data.results.pages}
					nextPage={() => setPage(data.results.currentPage + 1)}
					previousPage={() => setPage(data.results.currentPage - 1)}
					setPage={setPage}
				/>
			) : null}
			{data.hasHighlightedResults ? (
				<SendouButton
					variant="minimal"
					size="small"
					onPress={() =>
						setSearchParams((params) => {
							params.set("all", showAll ? "false" : "true");
							params.delete("page");

							return params;
						})
					}
				>
					{showAll
						? t("results.button.showHighlights")
						: t("results.button.showAll")}
				</SendouButton>
			) : null}
		</div>
	);
}
