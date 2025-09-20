<script lang="ts">
	import FriendCodeGate from '$lib/components/FriendCodeGate.svelte';
	import Main from '$lib/components/layout/Main.svelte';
	import StatusCircle from './StatusCircle.svelte';
	import * as TournamentAPI from '$lib/api/tournament';
	import type { PageProps } from './$types';
	import { getLocale } from '$lib/paraglide/runtime';
	import { getMinutes } from 'date-fns';
	import TeamInfoSection from './TeamInfo.svelte';
	import RegFlowSection from './RegFlowSection.svelte';
	import MapPool from './MapPool.svelte';

	let { params }: PageProps = $props();

	const { registrationClosesAt, mapPickingStyle } = $derived(
		await TournamentAPI.queries.myRegistrationById(params.id)
	);

	// xxx: add friend code somwhere
	// xxx: Pickup name should show required asterisk
</script>

<Main class="stack lg">
	<div>
		<h2>Registration</h2>
		<div class="text-sm text-lighter">
			Closes at
			{registrationClosesAt.toLocaleString(getLocale(), {
				weekday: 'short',
				day: 'numeric',
				month: 'numeric',
				year: '2-digit',
				hour: 'numeric',
				minute: getMinutes(registrationClosesAt) === 0 ? undefined : 'numeric'
			})}
		</div>
	</div>
	<FriendCodeGate>
		<div class="registration-flow">
			<TeamInfoSection tournamentId={params.id} />

			{#if mapPickingStyle}
				<MapPool tournamentId={params.id} />
			{/if}

			<StatusCircle status="WAIT" top={60 * 2} />
			<RegFlowSection>3.</RegFlowSection>
		</div>
	</FriendCodeGate>
</Main>

<style>
	.registration-flow {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--s-6) var(--s-6);
		align-items: start;

		@media (max-width: 768px) {
			grid-template-columns: 1fr;
			gap: var(--s-4);
		}
	}
</style>
