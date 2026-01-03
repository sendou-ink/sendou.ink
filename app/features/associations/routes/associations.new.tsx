import { useTranslation } from "react-i18next";
import { SendouDialog } from "~/components/elements/Dialog";
import { createNewAssociationSchema } from "~/features/associations/associations-schemas";
import { FormField } from "~/form/FormField";
import { SendouForm } from "~/form/SendouForm";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { associationsPage } from "~/utils/urls";

import { action } from "../actions/associations.new.server";
export { action };

export const handle: SendouRouteHandle = {
	i18n: ["scrims"],
};

export default function AssociationsNewPage() {
	const { t } = useTranslation(["scrims"]);

	return (
		<SendouDialog
			heading={t("scrims:associations.forms.title")}
			onCloseTo={associationsPage()}
		>
			<SendouForm schema={createNewAssociationSchema}>
				{({ names }) => <FormField name={names.name} />}
			</SendouForm>
		</SendouDialog>
	);
}
