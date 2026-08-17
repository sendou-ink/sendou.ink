<script lang="ts">
import * as v from "valibot";
import TimeRangeFormField from "#lib/form/fields/TimeRangeFormField.svelte";
import { m } from "#lib/paraglide/messages.js";
import { timeString } from "#lib/utils/schemas.ts";
import type { TimeRange } from "../scrims-types.ts";

interface Props {
	name: string;
	value: TimeRange | null;
	onChange: (value: TimeRange | null) => void;
}

let { name, value, onChange }: Props = $props();

// svelte-ignore state_referenced_locally -- the filter value seeds the draft only
let draft = $state(value);

function handleChange(timeRange: TimeRange | null) {
	draft = timeRange;

	if (timeRange === null) {
		onChange(null);
		return;
	}

	if (
		v.safeParse(timeString, timeRange.start).success &&
		v.safeParse(timeString, timeRange.end).success
	) {
		onChange(timeRange);
	}
}
</script>

<TimeRangeFormField
	{name}
	value={draft}
	onChange={handleChange}
	startLabel={m.forms_labels_start()}
	endLabel={m.forms_labels_end()}
/>
