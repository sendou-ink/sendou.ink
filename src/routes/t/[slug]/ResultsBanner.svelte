<script lang="ts">
	import type * as TeamAPI from '$lib/api/team';
	import Placement from '$lib/components/Placement.svelte';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		resultsPageHref: string;
		results: NonNullable<TeamAPI.queries.BySlugData['results']>;
	}

	const { results, resultsPageHref }: Props = $props();
</script>

<a href={resultsPageHref}>
	<div>{m.less_careful_tern_cry({ count: results.count })}</div>
	<ul>
		{#each results.placements as { placement, count } (placement)}
			<li>
				<Placement {placement} />×{count}
			</li>
		{/each}
	</ul>
</a>

<style>
	a {
		background-color: var(--color-base-card-section);
		border: var(--border-style);
		max-width: 32rem;
		margin: 0 auto;
		border-radius: var(--radius-box);
		padding: var(--s-1) var(--s-4);
		font-weight: var(--bold);
		font-size: var(--fonts-sm);
		display: flex;
		justify-content: space-between;
		width: min(100%, 48rem);
		color: var(--text);
		white-space: nowrap;
		transition: 0.1s ease-in-out background-color;
	}

	ul {
		list-style: none;
		display: flex;
		gap: var(--s-4);
	}

	li {
		display: flex;
		align-items: center;
		gap: var(--s-1);
	}
</style>
