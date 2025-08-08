<script lang="ts">
	import '../styles/utils.css';
	import '../styles/vars.css';
	import '../styles/flags.css';
	import '../styles/reset.css';

	import Header from '$lib/components/layout/Header.svelte';
	import Footer from '../lib/components/layout/Footer.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';

	let { children } = $props();
</script>

<svelte:boundary>
	<Header />
	{#snippet pending()}{/snippet}
	{@render children()}
	<Footer />
</svelte:boundary>

<ConfirmDialog />
