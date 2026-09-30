import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { Alert } from "~/components/Alert";
import { Main } from "~/components/Main";
import { SendouForm } from "~/form/SendouForm";
import { useHasRole } from "~/modules/permissions/hooks";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { action } from "../actions/org.new.server";
import { newOrganizationSchema } from "../tournament-organization-schemas";

export { action };

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "New organization",
		location: args.location,
	});
};

export const handle: SendouRouteHandle = {
	i18n: ["org"],
};

export default function NewOrganizationPage() {
	const isTournamentAdder = useHasRole("TOURNAMENT_ADDER");
	const { t } = useTranslation(["org"]);

	if (!isTournamentAdder) {
		return (
			<Main className="stack items-center">
				<Alert variation="WARNING">{t("org:new.noPermissions")}</Alert>
			</Main>
		);
	}

	return (
		<Main halfWidth>
			<SendouForm title={t("org:new.heading")} schema={newOrganizationSchema}>
				{({ FormField }) => <FormField name="name" />}
			</SendouForm>
		</Main>
	);
}
