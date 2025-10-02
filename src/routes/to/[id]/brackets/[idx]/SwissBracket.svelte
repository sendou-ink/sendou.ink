<script lang="ts">
	import type * as BracketAPI from '$lib/api/tournament-bracket';
	import Button from '$lib/components/buttons/Button.svelte';
	import Match from './Match.svelte';
	import RoundHeader from './RoundHeader.svelte';
	import { bracketState } from './compact.svelte';

	interface Props {
		bracket: Extract<BracketAPI.queries.BracketData, { type: 'swiss' }>;
		matchPageBaseHref?: string;
		currentGroupIdx: number;
		onGroupChange: (idx: number) => void;
	}

	const { bracket, matchPageBaseHref, currentGroupIdx, onGroupChange }: Props = $props();

	const roundsToDisplay = $derived(
		bracketState.isCompact
			? (() => {
					const incompleteRounds = bracket.rounds.filter((round) =>
						round.matches.some((match) => !match.isOver)
					);
					// Always show at least one round
					return incompleteRounds.length > 0 ? incompleteRounds : [bracket.rounds.at(-1)!];
				})()
			: bracket.rounds
	);
</script>

<div class="stack xl">
	{#if bracket.groups.length > 1}
		<div class="stack horizontal sm">
			{#each bracket.groups as group, i (group)}
				<Button
					variant={currentGroupIdx === i ? 'primary' : 'outlined'}
					size="small"
					onclick={() => onGroupChange(i)}
				>
					{group}
				</Button>
			{/each}
		</div>
	{/if}

	<div class="stack lg">
		{#each roundsToDisplay as round (round.id)}
			<div class="stack lg">
				<RoundHeader deadline={round.deadline} maps={round.maps}>
					{round.name}
				</RoundHeader>
				<div class="stack horizontal md lg-row flex-wrap">
					{#each round.matches as match (match.id)}
						{@const href = matchPageBaseHref ? `${matchPageBaseHref}/${match.id}` : undefined}
						<Match {match} {href} />
					{/each}
				</div>
			</div>
		{/each}
	</div>

	<!-- <PlacementsTable {bracket} groupId={selectedGroup.state} /> -->
</div>
