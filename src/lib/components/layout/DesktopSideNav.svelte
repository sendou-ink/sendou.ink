<script lang="ts">
	import { navItems } from '../../../routes/nav-items';
	import { asset } from '$app/paths';
</script>

<nav>
	{#each navItems as item (item.id)}
		<a href="/{item.url}" data-sveltekit-preload-data={item.prefetch ? 'hover' : 'off'}>
			<img src={asset(`/img/layout/${item.id}.avif`)} height={28} width={28} alt={item.name} />
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
		gap: var(--s-3);
		overflow-y: auto;
		max-height: calc(100vh - var(--layout-nav-height));
		min-width: fit-content;
		padding: var(--s-4) var(--s-6);
		border-right: var(--border-style);

		&::-webkit-scrollbar,
		&::-webkit-scrollbar-track {
			background-color: inherit;
			height: 18px;
			width: 18px;
		}

		&::-webkit-scrollbar-thumb {
			background-color: var(--color-primary-transparent);
			border: 6px solid transparent;
			border-radius: 99999px;
			background-clip: content-box;
		}

		img {
			background-color: var(--color-base-card);
			border-radius: var(--radius-box);
			padding: 0.225rem;
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
