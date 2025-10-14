import { useTranslation } from "react-i18next";
import type { z } from "zod/v4";
import { Alert } from "~/components/Alert";
import { InputFormField } from "~/components/form/InputFormField";
import { SendouForm } from "~/components/form/SendouForm";
import { Main } from "~/components/Main";
import { useHasRole } from "~/modules/permissions/hooks";
import { action } from "../actions/org.new.server";
import { newOrganizationSchema } from "../tournament-organization-schemas";
export { action };

type FormFields = z.infer<typeof newOrganizationSchema>;

export default function NewOrganizationPage() {
	const isTournamentAdder = useHasRole("TOURNAMENT_ADDER");
	const { t } = useTranslation(["common", "org"]);

	if (!isTournamentAdder) {
		return (
			<Main className="stack items-center">
				<Alert variation="WARNING">{t("org:new.noPermissions")}</Alert>
			</Main>
		);
	}

	return (
		<Main halfWidth>
			<SendouForm
				heading={t("org:new.heading")}
				schema={newOrganizationSchema}
				defaultValues={{
					name: "",
				}}
			>
				<InputFormField<FormFields>
					label={t("common:forms.name")}
					name="name"
					required
				/>
			</SendouForm>
		</Main>
	);
}
