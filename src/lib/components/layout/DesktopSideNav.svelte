<script lang="ts">
	import { navItems } from '../../../routes/nav-items';
	import { asset } from '$app/paths';
	import SideNav from '$lib/components/layout/SideNav.svelte';
	import SideNavLink from '$lib/components/layout/SideNavItem.svelte';
	import type { ResolvedPathname } from '$app/types';
</script>

<SideNav>
	{#each navItems as item (item.id)}
		<SideNavLink
			href={item.url as ResolvedPathname}
			data-sveltekit-preload-data={item.prefetch ? 'hover' : 'off'}
		>
			{#snippet icon()}
				<img src={asset(`/img/layout/${item.id}.avif`)} height={28} width={28} alt={item.name} />
			{/snippet}
			<div>{item.name}</div>
		</SideNavLink>
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
</SideNav>
