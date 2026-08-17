<script lang="ts">
import { m } from "#lib/paraglide/messages.js";

interface Props {
	associations: {
		virtual: string[];
		actual: Array<{ id: number; name: string }>;
	};
	id: string;
	value: string;
	onChange: (value: string) => void;
}

let { associations, id, value, onChange }: Props = $props();
</script>

<select
	{id}
	class="w-full"
	{value}
	onchange={(event) => onChange(event.currentTarget.value)}
>
	<option value="PUBLIC">{m.scrims_forms_visibility_public()}</option>
	{#each associations.virtual as association (association)}
		<option value={association}>
			{association === "FRIENDS"
				? m.scrims_forms_visibility_friends()
				: association}
		</option>
	{/each}
	{#each associations.actual as association (association.id)}
		<option value={association.id}>{association.name}</option>
	{/each}
</select>
