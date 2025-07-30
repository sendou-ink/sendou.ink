<script lang="ts">
	import { resolve } from '$app/paths';
	import Image from '$lib/components/image/image.svelte';
	import { rankedModesShort } from '$lib/constants/in-game/modes';
	import { modeImageUrl } from '$lib/utils/urls';
	import type { UserProfileData } from './user-profile.remote';

	interface Props {
		placements: UserProfileData['topPlacements'];
	}

	let { placements }: Props = $props();
</script>

<a href={resolve(`/xsearch/player/${placements[0].playerId}`)} data-testid="placements-box">
	{#each rankedModesShort as mode (mode)}
		{@const placement = placements.find((p) => p.mode === mode)}
		{#if placement}
			<div class="mode">
				<Image path={modeImageUrl(mode)} alt="" size={24} />
				<div>
					{placement.rank} / {placement.power}
				</div>
			</div>
		{/if}
	{/each}
</a>

<style>
	a {
		display: flex;
		flex-wrap: wrap;
		padding: var(--s-4);
		border-radius: var(--rounded);
		margin: 0 auto;
		background-color: var(--bg-lighter);
		color: var(--text);
		gap: var(--s-6);
		transition: 0.1s ease-in-out background-color;

		@media screen and (min-width: 480px) {
			gap: var(--s-10);
		}

		&:hover {
			background-color: var(--theme-transparent);
		}
	}

	.mode {
		display: flex;
		flex-direction: column;
		align-items: center;
		font-size: var(--fonts-xs);
		font-weight: var(--semi-bold);
		gap: var(--s-1-5);

		@media screen and (min-width: 480px) {
			font-size: var(--fonts-sm);
		}
	}
</style>
