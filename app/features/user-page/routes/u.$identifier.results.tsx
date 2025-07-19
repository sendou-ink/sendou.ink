import { useLoaderData, useMatches, useSearchParams } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import { LinkButton } from "~/components/elements/Button";
import { useUser } from "~/features/auth/core/user";
import { UserResultsTable } from "~/features/user-page/components/UserResultsTable";
import invariant from "~/utils/invariant";
import { userResultsEditHighlightsPage } from "~/utils/urls";
import { SendouButton } from "../../../components/elements/Button";
import { loader } from "../loaders/u.$identifier.results.server";
import type { UserPageLoaderData } from "../loaders/u.$identifier.server";
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
			<UserResultsTable id="user-results-table" results={data.results} />
			{data.hasHighlightedResults ? (
				<SendouButton
					variant="minimal"
					size="small"
					onPress={() =>
						setSearchParams((params) => {
							params.set("all", showAll ? "false" : "true");

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
