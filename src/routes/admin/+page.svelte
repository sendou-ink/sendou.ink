<script lang="ts">
	import Main from '$lib/components/layout/Main.svelte';

	import * as DevAPI from '$lib/api/dev';
	import Button from '$lib/components/buttons/Button.svelte';
</script>

<Main>
	<Button
		onclick={async () => await DevAPI.actions.seed('DEFAULT')}
		disabled={DevAPI.actions.seed.pending > 0}>Seed</Button
	>
</Main>
