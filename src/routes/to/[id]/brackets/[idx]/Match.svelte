<script lang="ts">
	import type * as BracketAPI from '$lib/api/tournament-bracket/queries.remote';
	import Avatar from '$lib/components/Avatar.svelte';

	interface Props {
		match: BracketAPI.BracketMatchData;
		/** Bracket mach page link, if missing means the bracket is preview */
		href?: string;
	}

	const { match, href }: Props = $props();

	const isBye = $derived(match.teams.some((team) => team === null));
</script>

{#if isBye}
	<div class="bye"></div>
{:else}
	<div class="relative">
		<div class="header">
			<div class="box">
				{match.identifier}
			</div>
		</div>

		<svelte:element this={href ? 'a' : 'div'} {href} class="match">
			{@render matchRow(0)}
			<div class="separator"></div>
			{@render matchRow(1)}
		</svelte:element>
	</div>
{/if}

{#snippet matchRow(side: 0 | 1)}
	{@const team = match.teams[side]}
	{@const isBigSeedNumber = team && team.seed > 99}
	{@const score = match.score?.[side]}

	<div
		class={{
			'stack horizontal': true,
			'text-lighter': team?.result === 'loss'
		}}
		title={team?.roster.join(', ')}
	>
		<div
			class={{
				seed: true,
				'text-lighter-important italic opaque': match.teams[side]?.isSimulated,
				seed__wide: isBigSeedNumber
			}}
		>
			{team ? team.seed : ''}
		</div>

		{#if team?.logoUrl}
			<Avatar size="xxxs" url={team.logoUrl} class="mr-1" />
		{/if}

		<div
			class={[
				'team-name',
				{
					'text-lighter italic opaque': match.teams[side]?.isSimulated,
					narrow: (team && team.logoUrl) || isBigSeedNumber,
					narrowest: team && team.logoUrl && isBigSeedNumber
				}
			]}
		>
			{team?.name}
		</div>

		<div class="score">
			{score ?? ''}
		</div>
	</div>
{/snippet}

<style>
	.bye {
		visibility: hidden;
		min-height: var(--match-height);
		max-height: var(--match-height);
	}

	.header {
		position: absolute;
		display: flex;
		justify-content: space-between;
		width: var(--match-width);
		margin-block-start: -16px;

		.box {
			background-color: var(--color-base-card);
			padding: var(--s-0-5) var(--s-1);
			border-radius: var(--radius-field);
			font-size: var(--fonts-xxxs) !important;
			font-weight: var(--semi-bold);
			border: 0;
		}
	}

	.match {
		width: var(--match-width);
		min-height: var(--match-height);
		max-height: var(--match-height);
		border-radius: var(--radius-field);
		background-color: var(--color-base-section);
		color: var(--color-base-content);
		font-size: var(--fonts-xxs);
		font-weight: var(--semi-bold);
		padding: 0 var(--s-2);
		display: flex;
		flex-direction: column;
		gap: var(--s-1);
		border: var(--border-style);
		justify-content: center;
		transition: background-color 0.2s;
	}

	a.match:hover {
		background-color: var(--bg-lighter);
	}

	.separator {
		min-height: 2px;
		max-height: 2px;
		width: 100%;
		background-color: var(--color-base-border);
	}

	.seed {
		color: var(--color-primary);
		margin-inline-end: var(--s-0-5);
		min-width: 15px;
		max-width: 15px;
	}

	.seed__wide {
		min-width: 22px;
		max-width: 22px;
	}

	.team-name {
		max-width: 95px;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		min-height: 16px;

		&.narrow {
			max-width: 75px;
		}

		&.narrowest {
			max-width: 70px;
		}
	}

	.score {
		margin-inline-start: auto;
	}
</style>
