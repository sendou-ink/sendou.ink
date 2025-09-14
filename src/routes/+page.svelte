<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import Main from '$lib/components/layout/Main.svelte';
	import SideNavItem from '$lib/components/layout/SideNavItem.svelte';
	import * as AuthAPI from '$lib/api/auth';
	import { navItems } from './nav-items';
	import { asset } from '$app/paths';
</script>

<Main class="front-page__container">
	{#snippet sideNav()}
		{#each navItems as item (item.id)}
			<SideNavItem
				href={item.url as ResolvedPathname}
				data-sveltekit-preload-data={item.prefetch ? 'hover' : 'off'}
			>
				{#snippet icon()}
					<img src={asset(`/img/layout/${item.id}.avif`)} height={28} width={28} alt={item.name} />
				{/snippet}
				<div>{item.name}</div>
			</SideNavItem>
		{/each}
		<!-- xxx: add logout
			{#if $user}
				<form method="post" action={LOG_OUT_URL}>
					<SendouButton
						size="small"
						variant="minimal"
						icon={LogOutIcon}
						type="submit"
						class="front-page__side-nav__log-out"
					>
						{$t('common:header.logout')}
					</SendouButton>
				</form>
			{/if} 
			-->
	{/snippet}
	{#if !(await AuthAPI.queries.me())?.roles.includes('MINOR_SUPPORT') && process.env.NODE_ENV === 'production'}
		<div class="top-leaderboard" id="pw-leaderboard_atf"></div>
	{/if}
	<h1>Welcome to SvelteKit</h1>
	<p>
		Visit <a href="https://svelte.dev/docs/kit">svelte.dev/docs/kit</a> to read the documentation
	</p>
</Main>

<style>
	p {
		margin-bottom: 100rem;
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
