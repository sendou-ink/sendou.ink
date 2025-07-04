import { useMatches } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import { LinkButton } from "~/components/elements/Button";
import { ArrowLeftIcon } from "~/components/icons/ArrowLeft";
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
				icon={<ArrowLeftIcon />}
				variant="outlined"
				size="small"
				className="mr-auto"
			>
				{t("common:actions.back")}
			</LinkButton>
		</div>
	);
}
