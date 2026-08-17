<script lang="ts">
import type { Snippet } from "svelte";
import { Dialog } from "@sendou/components";
import * as v from "valibot";
import FormField from "#lib/form/FormField.svelte";
import SendouForm from "#lib/form/SendouForm.svelte";
import { pickMap } from "../scrims.remote.ts";
import { pickMapFormSchema } from "../scrims-schemas.ts";

interface Props {
	trigger: Snippet<[{ onclick: () => void }]>;
	heading: string;
	scrimPostId: number;
}

let { trigger, heading, scrimPostId }: Props = $props();

async function handleSubmit(values: Record<string, unknown>) {
	await pickMap(values as v.InferInput<typeof pickMapFormSchema>);
	return undefined;
}
</script>

<Dialog {heading} {trigger}>
	<SendouForm
		schema={pickMapFormSchema}
		defaultValues={{ scrimPostId, mode: "SZ" }}
		onSubmit={handleSubmit}
	>
		<FormField name="mode" />
		<FormField name="stageId" />
	</SendouForm>
</Dialog>
