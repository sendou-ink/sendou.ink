<script lang="ts">
	import Button from '$lib/components/buttons/Button.svelte';

	//xxx: better name? Layout or something
	import SideNav from '$lib/components/layout/SideNav.svelte';
	import SideNavDivider from '$lib/components/layout/SideNavDivider.svelte';
	import type { Snippet } from 'svelte';
	import menu from '@lucide/svelte/icons/menu';

	interface Props {
		children?: Snippet;
		sideNav?: Snippet;
		sideNavHeading?: Snippet;
		class?: string;
		halfWidth?: boolean;
		bigger?: boolean;
		style?: string;
	}

	let {
		children,
		class: className,
		halfWidth = false,
		bigger = false,
		style,
		sideNav,
		sideNavHeading
	}: Props = $props();

	// const isMinorSupporter = useHasRole('MINOR_SUPPORT');
	const isMinorSupporter = false; // xxx: replace with actual role check

	const isRouteErrorResponse = false; // xxx: replace with actual error check if needed

	const showLeaderboard = $derived(
		import.meta.env.VITE_PLAYWIRE_PUBLISHER_ID && !isMinorSupporter && !isRouteErrorResponse
	);

	let isMobileSideNavOpen = $state(false);
</script>

<!-- xxx: SideNav for mobile -->
<div class={sideNav ? 'stack horizontal' : undefined}>
	{#if sideNav}
		<SideNav>
			{#if sideNavHeading}
				{@render sideNavHeading()}
				<SideNavDivider />
			{/if}
			{@render sideNav()}</SideNav
		>
	{/if}
	<div class="w-full">
		{#if sideNavHeading && sideNav}
			<div class="mobile-sidenav-heading">
				{@render sideNavHeading()}
				<div class="divider"></div>
				<Button
					icon={menu}
					variant="minimal"
					size="big"
					onclick={() => (isMobileSideNavOpen = true)}
				/>
				<SideNav
					bind:isMobileSideNavOpen
					isMobile
					closeMobileNav={() => (isMobileSideNavOpen = false)}
				>
					{@render sideNav()}
				</SideNav>
			</div>
		{/if}
		<main
			class={[
				className,
				'main',
				{
					'pt-8-forced': showLeaderboard,
					'half-width': halfWidth,
					bigger
				}
			]}
			{style}
		>
			{@render children?.()}
		</main>
	</div>
</div>

<style>
	.container {
		display: flex;
		flex-direction: row;
	}

	.main {
		width: 100%;
		max-width: 48rem;
		margin: 0 auto;
		padding-inline: var(--s-6);
		min-height: calc(100vh - var(--layout-nav-height));
		padding-block: var(--s-4) var(--s-32);
	}

	.half-width {
		width: 100%;
		max-width: 24rem;
		margin: 0 auto;
	}

	.bigger {
		width: 100%;
		max-width: 72rem;
		margin: 0 auto;
	}

	.mobile-sidenav-heading {
		padding: var(--s-4) var(--s-4) 0 var(--s-4);
		display: flex;
		align-items: center;
		gap: var(--s-4);

		@media screen and (min-width: 800px) {
			display: none;
		}
	}

	.divider {
		height: 38px;
		background-color: var(--color-base-border);
		width: 2.5px;
		border-radius: var(--radius-field);
	}
</style>
