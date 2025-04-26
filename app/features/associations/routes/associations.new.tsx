import { useTranslation } from "react-i18next";
import type { z } from "zod";
import { Dialog } from "~/components/Dialog";
import { MyForm } from "~/components/form/MyForm";
import { TextFormField } from "~/components/form/TextFormField";
import { createNewAssociationSchema } from "~/features/associations/associations-schemas";
import type { SendouRouteHandle } from "~/utils/remix.server";

import { associationsPage } from "~/utils/urls";
import { action } from "../actions/associations.new.server";
export { action };

type FormFields = z.infer<typeof createNewAssociationSchema>;

export const handle: SendouRouteHandle = {
	i18n: "scrims",
};

export default function AssociationsNewPage() {
	const { t } = useTranslation(["scrims"]);

	return (
		<Dialog isOpen>
			<MyForm
				title={t("scrims:associations.forms.title")}
				schema={createNewAssociationSchema}
				defaultValues={{
					name: "",
				}}
				cancelLink={associationsPage()}
			>
				<TextFormField<FormFields>
					label={t("scrims:associations.forms.name.title")}
					name="name"
				/>
			</MyForm>
		</Dialog>
	);
}
