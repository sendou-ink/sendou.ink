<script lang="ts">
import FormMessage from "#lib/components/FormMessage.svelte";
import FormFieldWrapper from "#lib/form/fields/FormFieldWrapper.svelte";
import { m } from "#lib/paraglide/messages.js";
import AssociationSelect from "./AssociationSelect.svelte";

interface Props {
	associations: {
		virtual: string[];
		actual: Array<{ id: number; name: string }>;
	};
	name: string;
	value: unknown;
	onChange: (value: unknown) => void;
	error: string | undefined;
}

let { associations, name, value, onChange, error }: Props = $props();

const id = $props.id();

const noAssociations = $derived(
	associations.virtual.length === 0 && associations.actual.length === 0,
);
</script>

<FormFieldWrapper
	{id}
	{name}
	label={m.scrims_forms_visibility_title()}
	{error}
>
	{#if noAssociations}
		<FormMessage type="info">
			{m.scrims_forms_visibility_noneAvailable()}
		</FormMessage>
	{:else}
		<AssociationSelect
			{associations}
			{id}
			value={String(value)}
			{onChange}
		/>
	{/if}
</FormFieldWrapper>
