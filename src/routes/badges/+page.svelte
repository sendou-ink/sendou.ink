<script lang="ts">
	import Badge from '$lib/components/badge.svelte';
	import Divider from '$lib/components/divider.svelte';
	import Input from '$lib/components/input.svelte';
	import SearchIcon from '$lib/components/icons/search.svelte';
	import { BADGES_DOC_LINK } from '$lib/utils/urls';
	import Main from '$lib/components/main.svelte';
	import { allBadges, type AllBadgesQuery } from './queries/all-badges.remote';
	import OpenGraphMeta from '$lib/components/open-graph-meta.svelte';

	let { children } = $props();

	let searchInputValue = $state('');

	const { ownBadges: allOwnBadges, otherBadges: allOtherBadges } = $derived(
		splitBadges(await allBadges())
	);

	const inputValueNormalized = $derived(searchInputValue.toLowerCase());

	const ownBadges = $derived(
		allOwnBadges.filter(
			(b) => !inputValueNormalized || b.displayName.toLowerCase().includes(inputValueNormalized)
		)
	);

	const otherBadges = $derived(
		allOtherBadges.filter(
			(b) => !inputValueNormalized || b.displayName.toLowerCase().includes(inputValueNormalized)
		)
	);

	function splitBadges(
		badges: AllBadgesQuery
		// currentUser: typeof $user xxx: TODO current user handling
	) {
		const ownBadges: AllBadgesQuery = [];
		const otherBadges: AllBadgesQuery = [];

		for (const badge of badges) {
			// xxx: TODO
			// if (currentUser && badge.permissions.MANAGE.includes(currentUser.id)) {
			// 	ownBadges.push(badge);
			// } else {
			// 	otherBadges.push(badge);
			// }

			otherBadges.push(badge);
		}

		return { ownBadges, otherBadges };
	}
</script>

<OpenGraphMeta
	title="Badges"
	ogTitle="Splatoon badges (tournament prizes list)"
	description="Over 400 badge tournament prizes and counting! Check out the full list including the owners."
/>

<Main>
	<div class="container">
		{@render children?.()}

		{#snippet searchIcon()}
			<SearchIcon class="search-icon" />
		{/snippet}

		<Input class="search-input" icon={searchIcon} bind:value={searchInputValue} />

		{#if ownBadges.length > 0}
			<div class="w-full">
				<Divider smallText>i18n: own.divider</Divider>
				<div class="small-badges">
					{#each ownBadges as badge (badge.id)}
						<a class="nav-link" href="/badges/{badge.id}">
							<Badge {badge} size={64} isAnimated={false} />
						</a>
					{/each}
				</div>
			</div>
		{/if}

		{#if ownBadges.length > 0 || otherBadges.length > 0}
			<div class="w-full">
				<div class="small-badges">
					{#if ownBadges.length > 0}
						<Divider smallText>i18n: other.divider</Divider>
					{/if}
					{#each otherBadges as badge (badge.id)}
						<!-- xxx: hide conditionally (when viewing the page of it) -->
						<a class="nav-link" href="/badges/{badge.id}">
							<Badge {badge} size={64} isAnimated={false} />
						</a>
					{/each}
				</div>
			</div>
		{:else}
			<div class="text-lg font-bold my-24">i18n: badges:noBadgesFound</div>
		{/if}
	</div>

	<div class="general-info-texts">
		<p>
			<a href={BADGES_DOC_LINK} target="_blank" rel="noopener noreferrer"> i18n: forYourEvent </a>
		</p>
	</div>
</Main>

<style>
	.container {
		display: flex;
		flex-direction: column;
		align-items: center;
		border-radius: var(--rounded);
		background-color: var(--bg-badge);
		color: var(--badge-text);
		gap: var(--s-6);
		padding-block: var(--s-2);
		padding-inline: var(--s-3);
	}

	.small-badges {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--s-2);
		margin-block-start: var(--s-1);
	}

	.general-info-texts {
		display: flex;
		justify-content: space-between;
		color: var(--text-lighter);
		font-size: var(--fonts-xs);
		padding-inline: var(--s-1);
	}

	.container :global(.search-input) {
		height: 40px !important;
		margin: 0 auto;
		font-size: var(--fonts-lg);
	}

	.container :global(.search-icon) {
		height: 25px;
		margin: auto;
		margin-right: 15px;
	}
</style>
