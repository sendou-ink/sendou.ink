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
	import { page } from '$app/state';
	import * as TournamentTeamAPI from '$lib/api/tournament-team';
	import { goto } from '$app/navigation';
	import { m } from '$lib/paraglide/messages';
	import InviteJoinDialog from '$lib/components/InviteJoinDialog.svelte';
	import { resolve } from '$app/paths';

	let { params }: PageProps = $props();

	const inviteCode = $derived(page.url.searchParams.get('code'));

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
		{#if inviteCode}
			<!-- xxx: add teamName and eventName -->
			<InviteJoinDialog
				dialogTitle={m.tournament_join_VALID({ teamName: '', eventName: '' })}
				validation={await TournamentTeamAPI.queries.validateInviteCode({
					inviteCode,
					tournamentId: params.id
				})}
				onConfirm={async () => {
					await TournamentTeamAPI.actions.joinTeam({ inviteCode, tournamentId: params.id });
					goto(resolve(`/to/[id]/register`, { id: params.id }));
				}}
				confirmPending={TournamentTeamAPI.actions.joinTeam.pending > 0}
			/>
		{/if}
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
