<script lang="ts">
	import EliminationBracketSide from './EliminationBracketSide.svelte';
	import type * as BracketAPI from '$lib/api/tournament-bracket';

	interface Props {
		tournamentId: string;
		bracket: BracketAPI.queries.BracketData;
	}

	const { bracket, tournamentId }: Props = $props();

	const matchPageBaseHref = $derived(bracket.isPreview ? undefined : `/to/${tournamentId}/matches`);

	// xxx: add scrolling bracket functionality
</script>

<div class="bracket">
	{#if bracket.type === 'double_elimination'}
		<EliminationBracketSide type="winners" rounds={bracket.winners} {matchPageBaseHref} />
		<EliminationBracketSide type="losers" rounds={bracket.losers} {matchPageBaseHref} />
	{/if}
</div>

<style>
	.bracket {
		--match-width: 140px;
		--match-height: 55px;
		overflow-x: auto;
		display: flex;
		flex-direction: column;
		gap: var(--s-8);
		padding-block-end: var(--s-6);
	}
</style>
