<script lang="ts">
	import { navItems } from './nav-items'; // Adjust import path as needed
	import { navIconUrl } from '$lib/utils/urls';
	import Image from '$lib/components/image.svelte';
</script>

<nav>
	{#each navItems as item (item.id)}
		<a href="/{item.url}" data-sveltekit-preload-data={item.prefetch ? 'hover' : 'off'}>
			<Image path={navIconUrl(item.id)} height={20} width={20} alt={item.name()} />
			<div>{item.name()}</div>
		</a>
	{/each}
	<!-- xxx: add logout -->
	<!-- {#if $user}
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
	{/if} -->
</nav>

<style>
	nav {
		display: none;
		position: fixed;
		left: 15px;
		top: 60px;
		flex-direction: column;
		gap: var(--s-3);
		overflow-y: auto;
		height: 100vh;
		padding-block-end: var(--s-48);
		padding-inline-end: var(--s-4);
	}

	@media screen and (min-width: 1130px) {
		nav {
			display: flex;
		}
	}

	nav :global(picture) {
		background-color: var(--bg-lightest);
		border-radius: var(--rounded);
		padding: 0.225rem;
	}

	a {
		display: flex;
		color: var(--text);
		font-size: var(--fonts-xs);
		font-weight: var(--bold);
		gap: var(--s-1-5);
		align-items: center;
	}

	nav :global(img) {
		min-width: 20px;
	}
</style>
