<script lang="ts">
import type { Snippet } from "svelte";
import { m } from "#lib/paraglide/messages.js";

interface Score {
	alpha: number;
	bravo: number;
	isFinal: boolean;
	count?: number;
	bestOf?: boolean;
}

interface Props {
	score?: Score;
	children?: Snippet;
}

let { score, children }: Props = $props();
</script>

<div class="root">
	{#if score}
		{@render scoreDisplay(score)}
	{:else}
		<div></div>
	{/if}
	{@render children?.()}
</div>

{#snippet scoreDisplay(score: Score)}
	<div class="values">
		<div>
			{score.alpha}-{score.bravo}
		</div>
		<div class="sub" data-testid={score.isFinal ? "match-final" : undefined}>
			{#if score.isFinal}
				{m.q_match_banner_final()}
			{:else if score.count !== undefined}
				{score.bestOf
					? m.q_match_banner_bestOf({ count: score.count })
					: m.q_match_banner_playAll({ count: score.count })}
			{/if}
		</div>
	</div>
{/snippet}

<style>
	.root {
		display: flex;
		justify-content: space-between;
		padding-inline: var(--s-1-5);
	}

	.values {
		display: flex;
		gap: var(--s-2);
		font-weight: var(--weight-semi);
	}

	.sub {
		color: var(--color-text-high);
	}
</style>
