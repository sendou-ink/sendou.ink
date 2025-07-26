<script lang="ts">
	import '../styles/common.css';
	import '../styles/utils.css';
	import '../styles/vars.css';
	import '../styles/reset.css';

	import { page } from '$app/state';

	let { children } = $props();

	const showLeaderboard = $derived(
		import.meta.env.VITE_PLAYWIRE_PUBLISHER_ID &&
			// !data?.user?.roles.includes('MINOR_SUPPORT') && xxx: add MINOR_SUPPORT
			!page.url.pathname.includes('plans')
	);
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
		</header>
		{#if showLeaderboard}
			<div class="top-leaderboard" id="pw-leaderboard_atf"></div>
		{/if}
		{@render children()}
		<!-- xxx: implement Footer -->
		<!-- <Footer /> -->
	</div>
</svelte:boundary>

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

	@media screen and (min-width: 601px) {
		.top-leaderboard {
			min-height: 120px;
		}
	}
</style>
