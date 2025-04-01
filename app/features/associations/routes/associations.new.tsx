import type { z } from "zod";
import { Dialog } from "~/components/Dialog";
import { MyForm } from "~/components/form/MyForm";
import { TextFormField } from "~/components/form/TextFormField";
import { createNewAssociationSchema } from "~/features/associations/associations-schemas";

import { associationsPage } from "~/utils/urls";
import { action } from "../actions/associations.new.server";
export { action };

type FormFields = z.infer<typeof createNewAssociationSchema>;

export default function AssociationsNewPage() {
	return (
		<Dialog isOpen>
			<MyForm
				title="Creating a new association"
				schema={createNewAssociationSchema}
				defaultValues={{
					name: "",
				}}
				cancelLink={associationsPage()}
			>
				<TextFormField<FormFields> label="Name" name="name" />
			</MyForm>
		</Dialog>
	);
}
