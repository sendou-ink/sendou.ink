<script lang="ts">
	import FriendCodeGate from '$lib/components/FriendCodeGate.svelte';
	import Main from '$lib/components/layout/Main.svelte';
	import * as TournamentAPI from '$lib/api/tournament';
	import type { PageProps } from './$types';
	import { getLocale } from '$lib/paraglide/runtime';
	import { getMinutes } from 'date-fns';
	import TeamInfoSection from './TeamInfo.svelte';
	import MapPool from './MapPool.svelte';
	import RosterSection from './RosterSection.svelte';
	import RegistrationSteps from './RegistrationSteps.svelte';

	let { params }: PageProps = $props();

	const { registrationClosesAt, mapPickingStyle } = $derived(
		await TournamentAPI.queries.myRegistrationById(params.id)
	);

	// xxx: add friend code somwhere
	// xxx: Pickup name should show required asterisk
	// xxx: tiebreakers in map pool
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
		<div class="stack lg">
			<RegistrationSteps tournamentId={params.id} />

			<TeamInfoSection tournamentId={params.id} />

			<RosterSection tournamentId={params.id} />

			{#if mapPickingStyle}
				<MapPool tournamentId={params.id} />
			{/if}
		</div>
	</FriendCodeGate>
</Main>
