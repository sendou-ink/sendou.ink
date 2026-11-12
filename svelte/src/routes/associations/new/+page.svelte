<script lang="ts">
import { createNewAssociationSchema } from "~/features/associations/associations-schemas";
import { associationsPage } from "~/features/associations/associations-urls";
import Dialog from "#lib/components/Dialog.svelte";
import { createAssociation } from "#lib/features/associations/associations.remote.ts";
import FormField from "#lib/form/FormField.svelte";
import SendouForm from "#lib/form/SendouForm.svelte";
import { m } from "#lib/paraglide/messages.js";
</script>

<Dialog
	heading={m.scrims_associations_forms_title()}
	onCloseTo={associationsPage()}
>
	<SendouForm form={createAssociation} schema={createNewAssociationSchema}>
		<FormField name="name" />
	</SendouForm>
</Dialog>
