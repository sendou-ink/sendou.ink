<script>
	import Main from '$lib/components/layout/Main.svelte';
	import DesktopSideNav from '../lib/components/layout/DesktopSideNav.svelte';
	import * as AuthAPI from '$lib/api/auth';
</script>

<div class="main-container">
	<DesktopSideNav />
	<Main class="front-page__container">
		{#if !(await AuthAPI.queries.me())?.roles.includes('MINOR_SUPPORT') && process.env.NODE_ENV === 'production'}
			<div class="top-leaderboard" id="pw-leaderboard_atf"></div>
		{/if}
		<h1>Welcome to SvelteKit</h1>
		<p>
			Visit <a href="https://svelte.dev/docs/kit">svelte.dev/docs/kit</a> to read the documentation
		</p>
	</Main>
</div>

<style>
	.main-container {
		display: flex;
		flex-direction: row;
	}

	.top-leaderboard {
		min-height: 130px;
		margin: 10px 0;

		@media screen and (min-width: 601px) {
			min-height: 120px;
		}
	}

	:global(.front-page__container) {
		--card-width: 225px;
		--card-height: 90px;
		display: flex;
		flex-direction: column;
		gap: var(--s-8);
	}
</style>
