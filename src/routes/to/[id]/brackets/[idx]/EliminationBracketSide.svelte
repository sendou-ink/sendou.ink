<script lang="ts">
	import RoundHeader from './RoundHeader.svelte';
	import type * as BracketAPI from '$lib/api/tournament-bracket';
	import Match from './Match.svelte';

	interface Props {
		rounds: Array<BracketAPI.queries.RoundData>;
		matchPageBaseHref?: string;
	}

	let { rounds, matchPageBaseHref }: Props = $props();

	// const atLeastOneColumnHidden = false; xxx: implement
</script>

<div class="container" style="--round-count: {rounds.length}">
	{#each rounds as round (round.id)}
		<div class="round-column" data-round-id={round.id}>
			<RoundHeader maps={round.maps}>
				{round.name}
			</RoundHeader>
			<div
				class={[
					'matches-container',
					{
						'top-bye': false // xxx: correct value here
						// !atLeastOneColumnHidden &&
						// type === 'winners' &&
						// (!bracket.data.match[0].opponent1 || !bracket.data.match[0].opponent2)
					}
				]}
			>
				{#each round.matches as match (match.id)}
					<Match
						{match}
						href={matchPageBaseHref ? `${matchPageBaseHref}/${match.id}` : undefined}
					/>
				{/each}
			</div>
		</div>
	{/each}
</div>

<style>
	.container {
		--line-width: 30px;
		display: grid;
		grid-template-columns: repeat(var(--round-count), calc(var(--match-width) + var(--line-width)));
	}

	.matches-container {
		display: flex;
		flex-direction: column;
		justify-content: space-around;
		gap: var(--s-7);
		margin-top: var(--s-6);
		flex: 1;
	}

	.top-bye {
		margin-top: -18px;
	}

	.round-column {
		display: flex;
		flex-direction: column;
	}
</style>
