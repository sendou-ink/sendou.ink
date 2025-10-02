<script lang="ts">
	import EliminationBracketSide from './EliminationBracketSide.svelte';
	import RoundRobinBracket from './RoundRobinBracket.svelte';
	import SwissBracket from './SwissBracket.svelte';
	import type * as BracketAPI from '$lib/api/tournament-bracket';

	interface Props {
		tournamentId: string;
		bracket: BracketAPI.queries.BracketData;
		currentGroupIdx: number;
		onGroupChange: (idx: number) => void;
	}

	const { bracket, tournamentId, currentGroupIdx, onGroupChange }: Props = $props();

	const matchPageBaseHref = $derived(bracket.isPreview ? undefined : `/to/${tournamentId}/matches`);

	// xxx: add scrolling bracket functionality
</script>

<div class="bracket">
	{#if bracket.type === 'single_elimination'}
		<EliminationBracketSide type="single" rounds={bracket.rounds} {matchPageBaseHref} />
	{/if}
	{#if bracket.type === 'double_elimination'}
		<EliminationBracketSide type="winners" rounds={bracket.winners} {matchPageBaseHref} />
		<EliminationBracketSide type="losers" rounds={bracket.losers} {matchPageBaseHref} />
	{/if}
	{#if bracket.type === 'round_robin'}
		<RoundRobinBracket {bracket} {matchPageBaseHref} />
	{/if}
	{#if bracket.type === 'swiss'}
		<SwissBracket {bracket} {matchPageBaseHref} {currentGroupIdx} {onGroupChange} />
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
