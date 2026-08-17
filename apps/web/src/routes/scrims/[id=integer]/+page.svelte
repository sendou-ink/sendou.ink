<script lang="ts">
import ScrimPage from "#lib/features/scrims/components/ScrimPage.svelte";
import { page } from "$app/state";

const scrimPostId = $derived(Number(page.params.id));
</script>

{#key scrimPostId}
	<ScrimPage {scrimPostId} />
{/key}
