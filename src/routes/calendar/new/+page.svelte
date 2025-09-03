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
	import { id } from '$lib/schemas';
	import EventBadgeField from './EventBadgeField.svelte';
	import * as AuthAPI from '$lib/api/auth';
	import Alert from '$lib/components/Alert.svelte';

	const eventIdToEdit = validatedSearchParam(id, 'id');

	const organizations = await OrganizationAPI.queries.byLoggedInUserOrganizerOf();
	const user = await AuthAPI.queries.me();

	const schema = CalendarAPI.schemas.newCalendarEventSchema;
	const validField = createFieldValidator(schema);
</script>

{#if user?.roles.includes('CALENDAR_EVENT_ADDER')}
	<Main>
		<Form
			heading={eventIdToEdit ? m.small_whole_hedgehog_dream() : m.home_great_fireant_treat()}
			{schema}
			defaultValues={eventIdToEdit
				? await CalendarAPI.queries.editEventFormData(eventIdToEdit)
				: undefined}
			action={CalendarAPI.actions.upsertEvent}
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
			<FormField name={validField('dates')} />
			<FormField name={validField('bracketUrl')} />
			<FormField name={validField('discordInviteCode')} />
			<FormField name={validField('tags')} />
			<FormField name={validField('badges')}>
				{#snippet children({ data, ...rest })}
					<EventBadgeField bind:value={data.value as number[]} {...rest} />
				{/snippet}
			</FormField>
			<FormField name={validField('mapPool')} />
			{#if eventIdToEdit}
				<FormField name={validField('eventIdToEdit')} />
			{/if}
		</Form>
	</Main>
{:else}
	<Main class="stack items-center">
		<Alert variation="WARNING">
			{m.white_witty_sheep_express()}
		</Alert>
	</Main>
{/if}
