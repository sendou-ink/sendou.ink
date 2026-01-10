import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useMatches } from "react-router";
import { LinkButton } from "~/components/elements/Button";
import type { TeamLoaderData } from "~/features/team/loaders/t.$customUrl.server";
import invariant from "~/utils/invariant";
import { teamPage } from "~/utils/urls";

export function TeamGoBackButton() {
	const { t } = useTranslation(["common"]);

	const [, parentRoute] = useMatches();
	invariant(parentRoute);
	const layoutData = parentRoute.data as TeamLoaderData;

	return (
		<div className="stack">
			<LinkButton
				to={teamPage(layoutData.team.customUrl)}
				icon={<ChevronLeft />}
				variant="outlined"
				size="small"
				className="mr-auto"
			>
				{t("common:actions.back")}
			</LinkButton>
		</div>
	);
}
