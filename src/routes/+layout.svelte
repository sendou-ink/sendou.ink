<script lang="ts">
	import '../styles/common.css';
	import '../styles/utils.css';
	import '../styles/vars.css';
	import '../styles/reset.css';

	import { me } from './queries/me.remote';
	import Footer from './footer.svelte';
	import Button from '$lib/components/button.svelte';
	import HeartIcon from '$lib/components/icons/heart.svelte';
	import { m } from '$lib/paraglide/messages';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';

	let { children } = $props();

	const isFrontPage = $derived(page.url.pathname === '/');
</script>

<svelte:boundary>
	{#snippet pending()}
		<p>loading...</p>
	{/snippet}

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
			<Button href={resolve('/support')} size="small" variant="outlined">
				{#snippet icon()}
					<HeartIcon />
				{/snippet}
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
		color: var(--text);
		font-size: var(--fonts-xs);
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.breadcrumb.logo {
		overflow: initial;
	}

	.logo:focus-visible {
		outline: 2px solid var(--theme);
		outline-offset: 2px;
		border-radius: var(--rounded);
	}

	.item-size {
		--item-size: 1.9rem;
	}

	.header {
		display: flex;
		width: 100%;
		align-items: center;
		justify-content: space-between;
		border-bottom: 1.5px solid var(--border);
		-webkit-backdrop-filter: var(--backdrop-filter);
		backdrop-filter: var(--backdrop-filter);
		background-color: transparent;
		font-weight: bold;
		padding-block: var(--s-2);
		padding-inline: var(--s-4);
		position: fixed;
		top: 0;
		z-index: 10;
	}

	.top-leaderboard {
		min-height: 130px;
		margin: 10px 0;
	}

	.right-container {
		display: flex;
		gap: var(--s-3);
		justify-self: flex-end;
	}

	@media screen and (min-width: 601px) {
		.top-leaderboard {
			min-height: 120px;
		}
	}
</style>
