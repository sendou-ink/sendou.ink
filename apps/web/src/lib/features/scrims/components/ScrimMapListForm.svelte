<script lang="ts">
import * as v from "valibot";
import FormField from "#lib/form/FormField.svelte";
import SendouForm from "#lib/form/SendouForm.svelte";
import { m } from "#lib/paraglide/messages.js";
import { type ScrimPageData, submitMapList } from "../scrims.remote.ts";
import { submitMapListFormSchema } from "../scrims-schemas.ts";
import SourceDependentFields from "./SourceDependentFields.svelte";

type SourceValue = "POOL" | "TOURNAMENT" | "FROM_POST";

interface Props {
	data: ScrimPageData;
}

let { data }: Props = $props();

const postTournament = $derived(data.post.mapsTournament);
const isPostAuthorSide = $derived(data.mapByMap.viewerSide === "ALPHA");
const useFromPost = $derived(postTournament != null && isPostAuthorSide);
// svelte-ignore state_referenced_locally -- the form's default source is decided once at mount
const defaultSource: SourceValue = useFromPost ? "FROM_POST" : "TOURNAMENT";

const sourceItems = $derived(
	useFromPost && postTournament
		? [
				{ value: "FROM_POST", label: () => postTournament.name },
				{ value: "POOL", label: () => m.forms_options_scrimMapSource_POOL() },
			]
		: [
				{
					value: "TOURNAMENT",
					label: () => m.forms_options_scrimMapSource_TOURNAMENT(),
				},
				{ value: "POOL", label: () => m.forms_options_scrimMapSource_POOL() },
			],
);

async function handleSubmit(values: Record<string, unknown>) {
	await submitMapList(
		values as v.InferInput<typeof submitMapListFormSchema>,
	);
	return undefined;
}
</script>

<div data-testid="scrim-map-list-form">
	<SendouForm
		title={m.scrims_mapByMap_submitListHeading()}
		schema={submitMapListFormSchema}
		submitButtonTestId="submit-map-list-button"
		fullWidth
		defaultValues={{ scrimPostId: data.post.id, source: defaultSource }}
		onSubmit={handleSubmit}
	>
		<FormField name="source" options={sourceItems} />
		<SourceDependentFields />
	</SendouForm>
</div>
