<script lang="ts">
import FormField from "#lib/form/FormField.svelte";
import { getFormContext } from "#lib/form/form-context.ts";

const context = getFormContext();

const source = $derived(context.value("source") as string | null);
</script>

{#if source === "POOL"}
	<FormField name="serializedPool" />
{:else if source === "TOURNAMENT"}
	<FormField name="tournamentId" />
{/if}
