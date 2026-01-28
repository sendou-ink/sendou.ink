import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { Alert } from "~/components/Alert";
import { Main } from "~/components/Main";
import { SendouForm } from "~/form";
import { useHasRole } from "~/modules/permissions/hooks";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { NEW_TEAM_PAGE, navIconUrl } from "~/utils/urls";
import { action } from "../actions/t.new.server";
import { loader } from "../loaders/t.new.server";
import { TEAM } from "../team-constants";
import { createTeamSchema } from "../team-schemas";
export { loader, action };

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "New team",
		location: args.location,
	});
};

export const handle: SendouRouteHandle = {
	i18n: ["team", "forms"],
	breadcrumb: () => ({
		imgPath: navIconUrl("t"),
		href: NEW_TEAM_PAGE,
		type: "IMAGE",
	}),
};

export default function NewTeamPage() {
	const { t } = useTranslation(["team"]);
	const data = useLoaderData<typeof loader>();
	const isSupporter = useHasRole("SUPPORTER");

	const canAddNewTeam = () => {
		if (isSupporter) {
			return data.teamMemberOfCount < TEAM.MAX_TEAM_COUNT_PATRON;
		}

		return data.teamMemberOfCount < TEAM.MAX_TEAM_COUNT_NON_PATRON;
	};

	return (
		<Main className="stack lg half-width">
			{!canAddNewTeam() ? (
				<Alert variation="WARNING">
					You can't add another team (max 2 for non-supporters and 5 for
					supporters).
				</Alert>
			) : (
				<SendouForm schema={createTeamSchema} title={t("team:newTeam.header")}>
					{({ FormField }) => <FormField name="name" />}
				</SendouForm>
			)}
		</Main>
	);
}
