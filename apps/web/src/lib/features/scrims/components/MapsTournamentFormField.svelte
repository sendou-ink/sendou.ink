<script lang="ts">
import FormField from "#lib/form/FormField.svelte";
import { getFormContext } from "#lib/form/form-context.ts";

const context = getFormContext();

const showField = $derived(context.value("maps") === "TOURNAMENT");
</script>

{#if showField}
	<FormField name="mapsTournamentId" />
{/if}
