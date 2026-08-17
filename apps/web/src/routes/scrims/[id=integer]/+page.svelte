<script lang="ts">
import DefaultMetaTags from "#lib/components/DefaultMetaTags.svelte";
import ScrimPage from "#lib/features/scrims/components/ScrimPage.svelte";
import { page } from "$app/state";

const scrimPostId = $derived(Number(page.params.id));
</script>

<DefaultMetaTags />

{#key scrimPostId}
	<ScrimPage {scrimPostId} />
{/key}
