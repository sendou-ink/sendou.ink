<script lang="ts">
	import Form from '$lib/components/form/Form.svelte';
	import * as CalendarAPI from '$lib/api/calendar';
	import FormField from '$lib/components/form/FormField.svelte';
	import { createFieldValidator } from '$lib/components/form/utils';
	import Main from '$lib/components/layout/Main.svelte';
	import * as OrganizationAPI from '$lib/api/organization';
	import SelectFormField from '$lib/components/form/SelectFormField.svelte';
	import { m } from '$lib/paraglide/messages';
	import { validatedSearchParam } from '$lib/utils/sveltekit';
	import EventBadgeField from '../../calendar/new/EventBadgeField.svelte';
	import * as AuthAPI from '$lib/api/auth';
	import Alert from '$lib/components/Alert.svelte';
	import Divider from '$lib/components/Divider.svelte';
	import { TOURNAMENT_MAP_PICKING_STYLES } from '$lib/constants/calendar';
	import { id } from '$lib/utils/zod';

	const tournamentIdToEdit = validatedSearchParam(id, 'id');

	const organizations = await OrganizationAPI.queries.byLoggedInUserOrganizerOf();
	const user = await AuthAPI.queries.me();

	const schema = CalendarAPI.schemas.newTournamentSchema;
	const validField = createFieldValidator(schema);

	const defaultValues = tournamentIdToEdit
		? await CalendarAPI.queries.editTournamentFormData(tournamentIdToEdit)
		: undefined;

	let mapPickingStyle = $state(defaultValues?.mapPickingStyle ?? TOURNAMENT_MAP_PICKING_STYLES[0]);

	$inspect(CalendarAPI.actions.upsertTournament.input);
</script>

<!-- xxx: templates -->

{#if user?.roles.includes('TOURNAMENT_ADDER')}
	<Main>
		<Form
			heading={tournamentIdToEdit ? m.dark_wacky_emu_surge() : m.spry_tough_marmot_expand()}
			{schema}
			defaultValues={tournamentIdToEdit
				? await CalendarAPI.queries.editTournamentFormData(tournamentIdToEdit)
				: undefined}
			action={CalendarAPI.actions.upsertTournament}
		>
			<FormField name={validField('name')} />
			<FormField name={validField('description')} />
			{#if organizations.length > 0}
				<FormField name={validField('organization')}>
					{#snippet children({ data, ...rest })}
						<SelectFormField
							{...rest}
							bind:value={data.value as string | null}
							items={organizations.map((org) => ({
								label: org.name,
								value: String(org.id)
							}))}
							clearable
						/>
					{/snippet}
				</FormField>
			{/if}
			<FormField name={validField('rules')} />
			<FormField name={validField('startsAt')} />
			<FormField name={validField('regClosesAt')} />
			<FormField name={validField('discordInviteCode')} />
			<FormField name={validField('tags')} />
			<FormField name={validField('badges')}>
				{#snippet children({ data, ...rest })}
					<EventBadgeField bind:value={data.value as number[]} {...rest} />
				{/snippet}
			</FormField>
			<FormField name={validField('logo')} />

			<Divider>Tournament settings</Divider>
			<FormField name={validField('minMembersPerTeam')} />
			<FormField name={validField('isRanked')} />
			<FormField name={validField('disableSubsTab')} />
			<FormField name={validField('autonomousSubs')} />
			<FormField name={validField('requireInGameNames')} />
			<FormField name={validField('isInvitational')} />
			<FormField name={validField('strictDeadlines')} />
			<FormField name={validField('isTest')} />

			<Divider>Tournament maps</Divider>
			<FormField name={validField('mapPickingStyle')} />
			{#if mapPickingStyle === 'TO'}
				<FormField name={validField('mapPool')} />
			{/if}
			{#if mapPickingStyle === 'AUTO_ALL'}
				<FormField name={validField('tieBreakerMapPool')} />
			{/if}

			<Divider>Tournament format</Divider>

			{#if tournamentIdToEdit}
				<FormField name={validField('tournamentIdToEdit')} />
			{/if}
		</Form>
	</Main>
{:else}
	<Main class="stack items-center">
		<Alert variation="WARNING">
			{m.noisy_lost_vole_thrive()}
		</Alert>
	</Main>
{/if}
