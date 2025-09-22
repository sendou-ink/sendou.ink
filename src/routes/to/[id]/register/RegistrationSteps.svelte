<script lang="ts">
	import * as TournamentAPI from '$lib/api/tournament';
	import Users from '@lucide/svelte/icons/users';
	import Map from '@lucide/svelte/icons/map';
	import Vote from '@lucide/svelte/icons/vote';
	import CaseUpper from '@lucide/svelte/icons/case-upper';
	import type { Component } from 'svelte';

	interface Props {
		tournamentId: string;
	}

	const { tournamentId }: Props = $props();

	const registration = $derived(await TournamentAPI.queries.myRegistrationById(tournamentId));
</script>

<div class="container">
	{@render step('Team info', CaseUpper)}
	{@render step('Roster', Users)}
	{#if registration.mapPickingStyle}
		{@render step('Map pool', Map)}
	{/if}
	{@render step('Check-in', Vote)}
</div>

{#snippet step(text: string, Icon: Component)}
	<div class="step"><Icon />{text}</div>
{/snippet}

<style>
	.container {
		display: flex;
		gap: var(--s-4);
	}

	.step {
		flex: 1;
		font-size: var(--fonts-xs);
		font-weight: var(--semi-bold);
		background-color: var(--color-base-card);
		border-radius: var(--radius-field);
		padding: var(--s-1) var(--s-2);
		display: grid;
		place-items: center;
		text-align: center;

		:global {
			svg {
				width: 18px;
			}
		}
	}
</style>
