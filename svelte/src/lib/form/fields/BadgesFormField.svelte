<script lang="ts">
import type { BadgeOption } from "~/form/types";
import BadgesSelector from "#lib/features/badges/components/BadgesSelector.svelte";
import { getSendouFormContext, storeOf } from "../form-context.ts";
import FormFieldWrapper from "./FormFieldWrapper.svelte";

interface Props {
	name: string;
	label?: string;
	bottomText?: string;
	maxCount?: number;
	options: BadgeOption[];
	disabled?: boolean;
}

let { name, label, bottomText, maxCount, options, disabled }: Props = $props();

const id = $props.id();
// svelte-ignore state_referenced_locally (a field's name is fixed for its lifetime)
const store = storeOf(getSendouFormContext(), name);

const value = $derived((store.value(name) as number[] | undefined) ?? []);
const error = $derived(store.error(name));
</script>

<FormFieldWrapper {id} {name} {label} {error} {bottomText}>
	<BadgesSelector
		{options}
		selectedBadges={value}
		onChange={(newBadges) => store.change(name, newBadges)}
		onBlur={() => store.blur(name)}
		{maxCount}
		{disabled}
	/>
</FormFieldWrapper>
