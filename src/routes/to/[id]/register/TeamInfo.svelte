<script lang="ts">
	import Form from '$lib/components/form/Form.svelte';
	import StatusCircle from './StatusCircle.svelte';
	import * as TournamentAPI from '$lib/api/tournament';
	import { createFieldValidator } from '$lib/components/form/utils';
	import FormField from '$lib/components/form/FormField.svelte';
	import * as TeamAPI from '$lib/api/team';
	import InputGroupFormField from '$lib/components/form/InputGroupFormField.svelte';
	import RegFlowSection from './RegFlowSection.svelte';
	import Button from '$lib/components/buttons/Button.svelte';
	import { m } from '$lib/paraglide/messages';
	import { confirmAction } from '$lib/utils/form';

	let { tournamentId }: { tournamentId: string } = $props();

	const { teamInfoDefaultValues, tournamentTeamId, canChangeRegistration } = $derived(
		await TournamentAPI.queries.myRegistrationById(tournamentId)
	);
	// xxx: fix warning
	let isPickup = $state(!tournamentTeamId || Boolean(teamInfoDefaultValues?.teamId));

	const schema = TournamentAPI.schemas.upsertTeamSchema;
	const validField = createFieldValidator(schema);

	// xxx: add friend code somwhere
	// xxx: Pickup name should show required asterisk
</script>

<StatusCircle status={tournamentTeamId ? 'OK' : 'MISSING'} />
<RegFlowSection>
	<Form
		{schema}
		action={tournamentTeamId
			? TournamentAPI.actions.updateTeam
			: TournamentAPI.actions.registerNewTeam}
		defaultValues={teamInfoDefaultValues}
		heading={m.tournament_pre_info_header()}
		onchange={(data) => {
			if (data.teamId) isPickup = false;
			else isPickup = true;
		}}
	>
		{#snippet secondaryButton()}
			{#if tournamentTeamId && canChangeRegistration}
				<Button
					variant="destructive"
					onclick={() =>
						confirmAction(() => TournamentAPI.actions.unregisterFromTournament(tournamentId), {
							title: m.tournament_pre_info_unregister_confirm(),
							button: {
								text: m.tournament_pre_info_unregister()
							}
						})}>{m.tournament_pre_info_unregister()}</Button
				>
			{/if}
		{/snippet}
		<FormField name={validField('tournamentId')} />
		{#if (await TeamAPI.queries.myTeams()).length > 0}
			<FormField name={validField('teamId')}>
				{#snippet children({ data, ...rest })}
					<InputGroupFormField
						{...rest}
						inputType="radio"
						bind:value={data.value as string}
						items={[
							{
								label: 'Pickup',
								value: 'pickup'
							},
							...(await TeamAPI.queries.myTeams()).map((team) => ({
								label: team.name,
								value: String(team.id)
							}))
						]}
					/>
				{/snippet}
			</FormField>
		{/if}
		{#if isPickup}
			<FormField name={validField('pickupName')} />
			<FormField name={validField('avatar')} />
		{/if}
	</Form></RegFlowSection
>
