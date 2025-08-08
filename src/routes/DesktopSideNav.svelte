<script lang="ts">
	import { navItems } from './nav-items'; // Adjust import path as needed
	import { navIconUrl } from '$lib/utils/urls';
	import Image from '$lib/components/image/Image.svelte';
</script>

<nav>
	{#each navItems as item (item.id)}
		<a href="/{item.url}" data-sveltekit-preload-data={item.prefetch ? 'hover' : 'off'}>
			<Image path={navIconUrl(item.id)} height={20} width={20} alt={item.name} />
			<div>{item.name}</div>
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
		position: sticky;
		left: 0;
		top: var(--layout-nav-height);
		flex-direction: column;
		gap: var(--s-4);
		overflow-y: auto;
		max-height: calc(100vh - var(--layout-nav-height));
		min-width: fit-content;
		padding: var(--s-4) var(--s-6);
		border-right: var(--border-style);

		@supports not selector(::-webkit-scrollbar) {
			scrollbar-width: thin;
			scrollbar-color: var(--color-primary) transparent;
		}

		&::-webkit-scrollbar,
		&::-webkit-scrollbar-track {
			background-color: inherit;
			height: 15px;
			width: 15px;
		}

		&::-webkit-scrollbar-thumb {
			background-color: var(--color-primary);
			border: 6px solid transparent;
			border-radius: 99999px;
			background-clip: content-box;
		}

		:global(picture) {
			background-color: var(--color-base-card);
			border-radius: var(--radius-box);
			padding: 0.225rem;
		}

		:global(img) {
			min-width: 20px;
		}

		@media screen and (min-width: 1130px) {
			display: flex;
		}
	}

	a {
		display: flex;
		color: var(--color-base-content);
		font-size: var(--fonts-xs);
		font-weight: var(--bold);
		gap: var(--s-1-5);
		align-items: center;
	}
</style>
