<script lang="ts">
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import type { ModeShort } from "~/modules/in-game-lists/types";
import MapPoolPicker, {
	type MapPoolQuickFill,
} from "#lib/components/MapPoolPicker.svelte";
import { getSendouFormContext, storeOf } from "../form-context.ts";
import FormFieldWrapper from "./FormFieldWrapper.svelte";

interface Props {
	name: string;
	label?: string;
	bottomText?: string;
	quickFill?: MapPoolQuickFill[];
	modes?: readonly ModeShort[];
	disabled?: boolean;
}

let { name, label, bottomText, quickFill, modes, disabled }: Props = $props();

const id = $props.id();
const context = getSendouFormContext();
// svelte-ignore state_referenced_locally (a field's name is fixed for its lifetime)
const store = storeOf(context, name);

const value = $derived(store.value(name) as string | undefined);
const mapPool = $derived(value ? new MapPool(value) : MapPool.EMPTY);
const error = $derived(store.error(name));

function handleChange(newMapPool: MapPool) {
	store.change(name, newMapPool.serialized);
	store.blur(name, newMapPool.serialized);
}
</script>

<FormFieldWrapper {id} {name} {label} {error} {bottomText}>
	<MapPoolPicker
		{mapPool}
		onChange={handleChange}
		{quickFill}
		{modes}
		{disabled}
		aria-label={context.translate(label)}
	/>
</FormFieldWrapper>
