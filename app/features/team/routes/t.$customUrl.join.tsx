import { Form, useLoaderData } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import { Main } from "~/components/Main";
import { SubmitButton } from "~/components/SubmitButton";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { action } from "../actions/t.$customUrl.join.server";
import { loader } from "../loaders/t.$customUrl.join.server";
import "../team.css";

export { loader, action };

export const handle: SendouRouteHandle = {
	i18n: ["team"],
};

export default function JoinTeamPage() {
	const { t } = useTranslation(["team", "common"]);
	const { validation, teamName } = useLoaderData<{
		// not sure why using typeof loader here results validation in being typed as "string"
		validation:
			| "SHORT_CODE"
			| "INVITE_CODE_WRONG"
			| "TEAM_FULL"
			| "REACHED_TEAM_COUNT_LIMIT"
			| "VALID";
		teamName: string;
	}>();

	return (
		<Main>
			<Form method="post" className="team__invite-container">
				<div className="text-center">
					{t(`team:validation.${validation}`, { teamName })}
				</div>
				{validation === "VALID" ? (
					<SubmitButton size="big">{t("common:actions.join")}</SubmitButton>
				) : null}
			</Form>
		</Main>
	);
}
