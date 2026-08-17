<script lang="ts">
import * as v from "valibot";
import FormField from "#lib/form/FormField.svelte";
import SendouForm from "#lib/form/SendouForm.svelte";
import { m } from "#lib/paraglide/messages.js";
import { scrimsPage } from "#lib/utils/urls.ts";
import { goto } from "$app/navigation";
import { SCRIM } from "../scrims-constants.ts";
import { createScrimPost, getScrimsNewData } from "../scrims.remote.ts";
import { scrimsNewFormSchema } from "../scrims-schemas.ts";
import BaseVisibilityFormField from "./BaseVisibilityFormField.svelte";
import MapsTournamentFormField from "./MapsTournamentFormField.svelte";
import NotFoundVisibilityFormField, {
	DEFAULT_NOT_FOUND_VISIBILITY,
} from "./NotFoundVisibilityFormField.svelte";
import WithFormField from "./WithFormField.svelte";

const data = $derived(await getScrimsNewData());

function nullFilledArray(length: number) {
	return Array.from({ length }, () => null);
}

async function handleSubmit(values: Record<string, unknown>) {
	const result = await createScrimPost(
		values as v.InferInput<typeof scrimsNewFormSchema>,
	);

	if (result?.fieldErrors) return result;

	await goto(scrimsPage());
	return undefined;
}
</script>

<SendouForm
	schema={scrimsNewFormSchema}
	title={m.scrims_forms_title()}
	defaultValues={{
		postText: "",
		at: new Date(),
		rangeEnd: null,
		baseVisibility: "PUBLIC",
		notFoundVisibility: DEFAULT_NOT_FOUND_VISIBILITY,
		from:
			data.teams.length > 0
				? { mode: "TEAM", teamId: data.teams[0].id }
				: {
						mode: "PICKUP",
						users: nullFilledArray(
							SCRIM.MAX_PICKUP_SIZE_EXCLUDING_OWNER,
						) as unknown as number[],
					},
		managedByAnyone: true,
		maps: "NO_PREFERENCE",
		mapsTournamentId: null,
	}}
	onSubmit={handleSubmit}
>
	<FormField name="from">
		{#snippet children(props)}
			<WithFormField
				usersTeams={data.teams}
				recentPickupRosters={data.recentPickupRosters}
				{...props}
			/>
		{/snippet}
	</FormField>

	<FormField name="at" />
	<FormField name="rangeEnd" />

	<FormField name="baseVisibility">
		{#snippet children(props)}
			<BaseVisibilityFormField associations={data.associations} {...props} />
		{/snippet}
	</FormField>

	<NotFoundVisibilityFormField associations={data.associations} />

	<FormField name="divs" />

	<FormField name="maps" />

	<MapsTournamentFormField />

	<FormField name="postText" />

	<FormField name="managedByAnyone" />
</SendouForm>
