<script lang="ts">
	import '../styles/utils.css';
	import '../styles/vars.css';
	import '../styles/flags.css';
	import '../styles/reset.css';

	import { me } from './me.remote';
	import Footer from './Footer.svelte';
	import Button from '$lib/components/Button.svelte';
	import { m } from '$lib/paraglide/messages';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Heart from '@lucide/svelte/icons/heart';

	let { children } = $props();

	const isFrontPage = $derived(page.url.pathname === '/');
</script>

<svelte:boundary>
	<!-- empty snippet to make navigation "suspend" while data is loading -->
	{#snippet pending()}{/snippet}

	<div class="container">
		<!-- xxx: implement NavDialog & Hamburger -->
		<!-- <NavDialog isOpen={navDialogOpen} close={closeNavDialog} /> -->
		<!-- {#if isFrontPage}
		<SendouButton
			icon={HamburgerIcon}
			class="hamburger fab"
			variant="outlined"
			onPress={openNavDialog}
		/>
	{/if} -->
		<header class="header item-size">
			<div class="breadcrumb-container">
				<a href="/" class="breadcrumb logo"> sendou.ink </a>
				<!-- xxx: breadcrumbs go here -->
			</div>
			<!-- xxx: implement TopRightButtons -->
			<!-- <TopRightButtons
			{isErrored}
			showSupport={Boolean(
				data && !data?.user?.roles.includes('MINOR_SUPPORT') && isFrontPage
			)}
			{openNavDialog}
		/> -->
			{@render topRightButtons(isFrontPage && !(await me())?.roles.includes('MINOR_SUPPORT'))}
		</header>
		{#if !(await me())?.roles.includes('MINOR_SUPPORT') && process.env.NODE_ENV === 'production'}
			<div class="top-leaderboard" id="pw-leaderboard_atf"></div>
		{/if}
		{@render children()}
		<Footer />
	</div>
</svelte:boundary>

{#snippet topRightButtons(showSupport: boolean)}
	<div class="right-container">
		{#if showSupport}
			<Button href={resolve('/support')} icon={Heart} size="small" variant="outlined">
				{m.common_pages_support()}
			</Button>
		{/if}
		<!-- <NotificationPopover />
			<AnythingAdder /> -->
		<!-- <button
				aria-label="Open navigation"
				onClick={openNavDialog}
				className="layout__header__button"
				type="button"
			>
				<HamburgerIcon className="layout__header__button__icon" />
			</button> -->
		<!-- <UserItem /> -->
	</div>
{/snippet}

<!-- xxx: Check the mobile styles -->
<style>
	:global(:root) {
		width: 100%;
		background-color: var(--color-base-bg);
		color: var(--color-base-content);
		font-family: lexend, sans-serif;
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: antialiased;
		line-height: 1.5;
		overflow-x: hidden;
		-webkit-tap-highlight-color: transparent;

		scrollbar-color: var(--color-primary-transparent) transparent;
		scrollbar-width: thin;
		scrollbar-gutter: stable;
	}

	.container {
		width: 100%;
		min-height: 100vh;
		padding-top: 50px; /** compensate for header */
	}

	.breadcrumb-container {
		display: flex;

		/** check if should use px or not */
		height: 30px;
		align-items: center;
		gap: var(--s-2);
	}

	.breadcrumb {
		overflow: hidden;
		max-width: 350px;
		color: var(--color-base-content);
		font-size: var(--fonts-xs);
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;

		&.logo {
			overflow: initial;
		}
	}

	.logo:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
		border-radius: var(--radius-box);
	}

	.item-size {
		--item-size: 1.9rem;
	}

	.header {
		display: flex;
		width: 100%;
		align-items: center;
		justify-content: space-between;
		border-bottom: var(--border-style);
		background-color: var(--color-base-section);
		font-weight: bold;
		padding-block: var(--s-1-5);
		padding-inline: var(--s-4);
		position: fixed;
		top: 0;
		z-index: 50;
	}

	.top-leaderboard {
		min-height: 130px;
		margin: 10px 0;

		@media screen and (min-width: 601px) {
			min-height: 120px;
		}
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
