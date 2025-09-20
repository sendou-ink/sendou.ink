<script lang="ts">
	import Form from '$lib/components/form/Form.svelte';
	import StatusCircle from './StatusCircle.svelte';
	import * as TournamentAPI from '$lib/api/tournament';
	import { createFieldValidator } from '$lib/components/form/utils';
	import FormField from '$lib/components/form/FormField.svelte';
	import RegFlowSection from './RegFlowSection.svelte';
	import { m } from '$lib/paraglide/messages';
	import { TOURNAMENT_MAP_PICKING_STYLES } from '$lib/constants/calendar';

	const { tournamentId }: { tournamentId: string } = $props();

	const { mapPickingStyle, mapPoolDefaultValues } = $derived(
		await TournamentAPI.queries.myRegistrationById(tournamentId)
	);

	const schema = TournamentAPI.schemas.upsertTeamMapPool;
	const validField = createFieldValidator(schema);
</script>

<StatusCircle
	status={mapPoolDefaultValues.AUTO_ALL ||
	mapPoolDefaultValues.AUTO_SZ ||
	mapPoolDefaultValues.AUTO_TC ||
	mapPoolDefaultValues.AUTO_RM ||
	mapPoolDefaultValues.AUTO_CB
		? 'OK'
		: 'MISSING'}
/>
<RegFlowSection>
	<Form
		{schema}
		action={TournamentAPI.actions.upsertMapPool}
		defaultValues={mapPoolDefaultValues}
		heading={m.tournament_pre_steps_pool()}
	>
		<FormField name={validField('tournamentId')} />
		{#each TOURNAMENT_MAP_PICKING_STYLES.filter((style) => style !== 'TO') as style (style)}
			{#if mapPickingStyle === style}
				<FormField name={validField(style)} />
			{/if}
		{/each}
	</Form></RegFlowSection
>
