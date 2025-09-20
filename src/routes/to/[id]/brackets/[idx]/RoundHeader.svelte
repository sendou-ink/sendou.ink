<script lang="ts">
	import * as Deadline from '$lib/core/tournament-bracket/Deadline';
	import { getLocale } from '$lib/paraglide/runtime';
	import type { TournamentRoundMaps } from '$lib/server/db/tables';
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
		deadline?: Deadline.Deadline;
		maps?: TournamentRoundMaps | null;
	}

	let { children, deadline, maps }: Props = $props();

	const countPrefix = $derived(maps?.type === 'PLAY_ALL' ? 'Play all ' : 'Bo');
	const pickBanSuffix = $derived(
		maps?.pickBan === 'COUNTERPICK' ? ' (C)' : maps?.pickBan === 'BAN_2' ? ' (B)' : ''
	);
</script>

<div>
	<div class="name">{@render children()}</div>
	{#if maps?.count}
		<div class="infos">
			<div>
				{countPrefix}{maps.count}
				{pickBanSuffix}
			</div>
			{#if deadline}
				{@render deadlineText(deadline)}
			{/if}
		</div>
	{/if}
</div>

{#snippet deadlineText(deadline: Deadline.Deadline)}
	{#if deadline.type === 'tournament'}
		<div
			class={{
				'text-warning': deadline.at < new Date()
			}}
		>
			DL
			{deadline.at.toLocaleTimeString(getLocale(), {
				hour: 'numeric',
				minute: 'numeric'
			})}
		</div>
	{:else}
		<div class="infos">
			<div>
				{deadline.at.toLocaleDateString(getLocale(), {
					month: 'short',
					day: 'numeric'
				})}
				→
			</div>
		</div>
	{/if}
{/snippet}

<style>
	.name {
		text-align: center;
		background-color: var(--color-base-section);
		border: var(--border-style);
		font-size: var(--fonts-xs);
		font-weight: var(--semi-bold);
		padding-block: var(--s-2);
		width: var(--match-width);
		border-radius: var(--radius-field);
	}

	.infos {
		width: var(--match-width);
		display: flex;
		justify-content: space-between;
		font-size: var(--fonts-xxs);
		color: var(--color-base-content-secondary);
		font-weight: var(--semi-bold);
	}
</style>
