<script lang="ts">
	import type * as BracketAPI from '$lib/api/tournament-bracket';
	import Match from './Match.svelte';
	import RoundHeader from './RoundHeader.svelte';

	interface Props {
		bracket: Extract<BracketAPI.queries.BracketData, { type: 'round_robin' }>;
		matchPageBaseHref?: string;
	}

	const { bracket, matchPageBaseHref }: Props = $props();
</script>

<div class="stack xl">
	{#each bracket.groups as group (group.letters)}
		<div class="group-section">
			<h2 class="group-title">Group {group.letters}</h2>
			<div class="container" style="--round-count: {group.rounds.length}">
				{#each group.rounds as round (round.id)}
					<div class="round-column">
						<RoundHeader deadline={round.deadline} maps={round.maps}>
							{round.name}
						</RoundHeader>
						<div class="round-matches-container">
							{#each round.matches as match (match.id)}
								{@const href = matchPageBaseHref ? `${matchPageBaseHref}/${match.id}` : undefined}
								<Match {match} {href} />
							{/each}
						</div>
					</div>
				{/each}
			</div>
			<!-- <PlacementsTable {bracket} groupId={group.id} /> -->
		</div>
	{/each}
</div>

<style>
	.group-section {
		display: flex;
		flex-direction: column;
		gap: var(--s-4);
	}

	.group-title {
		font-size: var(--fonts-lg);
	}

	.container {
		display: grid;
		grid-template-columns: repeat(var(--round-count), calc(var(--match-width) + 30px));
	}

	.round-matches-container {
		display: flex;
		flex-direction: column;
		justify-content: space-around;
		gap: var(--s-7);
		margin-top: var(--s-6);
		flex: 1;
	}

	.round-column {
		display: flex;
		flex-direction: column;
	}
</style>
