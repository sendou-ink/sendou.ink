<script lang="ts">
	import { asset, resolve } from '$app/paths';
	import type { ProfileByIdentifierData } from '$lib/api/user/queries.remote';
	import { rankedModesShort } from '$lib/constants/in-game/modes';

	interface Props {
		placements: ProfileByIdentifierData['topPlacements'];
	}

	let { placements }: Props = $props();
</script>

<a href={resolve(`/xsearch/player/${placements[0].playerId}`)} data-testid="placements-box">
	{#each rankedModesShort as mode (mode)}
		{@const placement = placements.find((p) => p.mode === mode)}
		{#if placement}
			<div class="mode">
				<img src={asset(`/img/modes/${mode}.avif`)} alt="" height={24} width={24} />
				<div>
					{placement.rank} / {placement.power}
				</div>
			</div>
		{/if}
	{/each}
</a>

<style>
	a {
		background-color: var(--color-base-card-section);
		border: var(--border-style);
		display: flex;
		flex-wrap: wrap;
		padding: var(--s-4);
		border-radius: var(--radius-box);
		margin: 0 auto;
		color: var(--text);
		gap: var(--s-6);

		@media screen and (min-width: 480px) {
			gap: var(--s-10);
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
