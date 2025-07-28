<script>
	import Main from '$lib/components/main.svelte';
	import DesktopSideNav from './desktop-side-nav.svelte';
</script>

<Main class="front-page__container">
	<DesktopSideNav />
	<h1>Welcome to SvelteKit</h1>
	<p>
		Visit <a href="https://svelte.dev/docs/kit">svelte.dev/docs/kit</a> to read the documentation
	</p>
</Main>

<style>
	:global(.front-page__container) {
		--card-width: 225px;
		--card-height: 90px;
		display: flex;
		flex-direction: column;
		gap: var(--s-8);
	}
</style>
