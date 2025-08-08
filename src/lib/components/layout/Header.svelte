<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages';
	import { me } from '../../../routes/me.remote';
	import Heart from '@lucide/svelte/icons/heart';
	import Button from '$lib/components/buttons/Button.svelte';
	import Breadcrumbs from './Breadcrumbs.svelte';

	const isFrontPage = $derived(page.url.pathname === '/');
</script>

<!-- 
xxx: implement NavDialog & Hamburger
<NavDialog isOpen={navDialogOpen} close={closeNavDialog} />
{#if isFrontPage}
	<SendouButton
		icon={HamburgerIcon}
		class="hamburger fab"
		variant="outlined"
		onPress={openNavDialog}
	/>
{/if} 
-->
<header class="header item-size">
	<!-- 
    xxx: implement TopRightButtons
    <TopRightButtons
		{isErrored}
		showSupport={Boolean(
		    data && !data?.user?.roles.includes('MINOR_SUPPORT') && isFrontPage
		)}
		{openNavDialog}
	/> 
    -->
	<Breadcrumbs />
	<div class="right-container">
		{#if isFrontPage && !(await me())?.roles.includes('MINOR_SUPPORT')}
			<Button href={resolve('/support')} icon={Heart} size="small" variant="outlined">
				{m.common_pages_support()}
			</Button>
		{/if}
		<!-- 
        <NotificationPopover />
		<AnythingAdder /> 
        <button
			aria-label="Open navigation"
			onClick={openNavDialog}
			className="layout__header__button"
			type="button"
		>
			<HamburgerIcon className="layout__header__button__icon" />
		</button> 
        <UserItem /> 
        -->
	</div>
</header>

<!-- xxx: Check the mobile styles -->
<style>
	.item-size {
		--item-size: 1.9rem;
	}

	.header {
		display: flex;
		width: 100%;
		height: var(--layout-nav-height);
		align-items: center;
		justify-content: space-between;
		border-bottom: var(--border-style);
		background-color: var(--color-base-section);
		font-weight: bold;
		padding-block: var(--s-1-5);
		padding-inline: var(--s-4);
		position: sticky;
		top: 0;
		z-index: 50;
	}

	.right-container {
		display: flex;
		gap: var(--s-3);
		justify-self: flex-end;

		:global(svg) {
			fill: var(--color-primary);
		}
	}
</style>
