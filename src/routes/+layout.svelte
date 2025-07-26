<script>
	import '../styles/common.css';
	import '../styles/utils.css';
	import '../styles/vars.css';
	import '../styles/reset.css';
</script>

<svelte:boundary>
	{#snippet pending()}
		<p>loading...</p>
	{/snippet}

	<slot />
</svelte:boundary>
