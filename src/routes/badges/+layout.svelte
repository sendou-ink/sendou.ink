<script lang="ts">
	import Badge from '$lib/components/badge/Badge.svelte';
	import Divider from '$lib/components/Divider.svelte';
	import Input from '$lib/components/Input.svelte';
	import Main from '$lib/components/layout/Main.svelte';
	import { allBadges } from './all-badges.remote';
	import OpenGraphMeta from '$lib/components/OpenGraphMeta.svelte';
	import { m } from '$lib/paraglide/messages';
	import { resolve } from '$app/paths';

	let { children } = $props();

	let searchInputValue = $state('');

	const badges = await allBadges();

	const inputValueNormalized = $derived(searchInputValue.toLowerCase());

	const ownBadges = $derived(
		badges.own.filter(
			(b) => !inputValueNormalized || b.displayName.toLowerCase().includes(inputValueNormalized)
		)
	);

	const otherBadges = $derived(
		badges.other.filter(
			(b) => !inputValueNormalized || b.displayName.toLowerCase().includes(inputValueNormalized)
		)
	);
</script>

<OpenGraphMeta
	title="Badges"
	ogTitle="Splatoon badges (tournament prizes list)"
	description="Over 400 badge tournament prizes and counting! Check out the full list including the owners."
/>

<Main>
	<div class="container">
		{@render children?.()}

		<Input type="search" bind:value={searchInputValue} />

		{#if ownBadges.length > 0}
			<div class="w-full">
				<Divider smallText>{m.badges_own_divider()}</Divider>
				<div class="small-badges">
					{#each ownBadges as badge (badge.id)}
						<a class="nav-link" href={resolve(`/badges/${badge.id}`)}>
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
						<Divider smallText>{m.badges_other_divider()}</Divider>
					{/if}
					{#each otherBadges as badge (badge.id)}
						<!-- xxx: hide conditionally (when viewing the page of it) -->
						<a class="nav-link" href={resolve(`/badges/${badge.id}`)}>
							<Badge {badge} size={64} isAnimated={false} />
						</a>
					{/each}
				</div>
			</div>
		{:else}
			<div class="text-lg font-bold my-24">{m.badges_noBadgesFound()}</div>
		{/if}
	</div>

	<div class="general-info-texts">
		<p>
			<a
				href="https://github.com/sendou-ink/sendou.ink/blob/rewrite/docs/badges.md"
				target="_blank"
				rel="noopener noreferrer">{m.badges_forYourEvent()}</a
			>
		</p>
	</div>
</Main>

<style>
	.container {
		display: flex;
		flex-direction: column;
		align-items: center;
		border-radius: var(--radius-box);
		background-color: #000;
		color: #fff;
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
		color: var(--color-base-content-secondary);
		font-size: var(--fonts-xs);
		padding-inline: var(--s-1);
	}
</style>
