<script lang="ts">
import DualSelectFormField from "#lib/form/fields/DualSelectFormField.svelte";
import { m } from "#lib/paraglide/messages.js";
import { LUTI_DIVS } from "../scrims-constants.ts";
import type { LutiDiv, ScrimFilters } from "../scrims-types.ts";

interface Props {
	value: ScrimFilters["divs"];
	onChange: (value: ScrimFilters["divs"]) => void;
}

let { value, onChange }: Props = $props();

// svelte-ignore state_referenced_locally -- the filter value seeds the draft only
let draft = $state<[LutiDiv | null, LutiDiv | null]>([
	value?.max ?? null,
	value?.min ?? null,
]);

const divItems = LUTI_DIVS.map((div) => ({ label: div, value: div }));

function handleChange(newValue: [string | null, string | null]) {
	const typedValue = newValue as [LutiDiv | null, LutiDiv | null];
	draft = typedValue;

	const [max, min] = typedValue;
	if (max !== null && min !== null) {
		onChange({ max, min });
	} else if (max === null && min === null) {
		onChange(null);
	}
}
</script>

<DualSelectFormField
	name="divs"
	fields={[
		{ label: m.forms_labels_scrimMaxDiv(), items: divItems },
		{ label: m.forms_labels_scrimMinDiv(), items: divItems },
	]}
	value={draft}
	onChange={handleChange}
/>
