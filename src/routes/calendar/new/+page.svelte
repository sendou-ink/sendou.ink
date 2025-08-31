<script lang="ts">
	import Form from '$lib/components/form/Form.svelte';
	import * as CalendarAPI from '$lib/api/calendar';
	import FormField from '$lib/components/form/FormField.svelte';
	import { createFieldValidator } from '$lib/components/form/utils';
	import Main from '$lib/components/layout/Main.svelte';
	import * as OrganizationAPI from '$lib/api/organization';
	import SelectFormField from '$lib/components/form/SelectFormField.svelte';
	import { m } from '$lib/paraglide/messages';

	const organizations = await OrganizationAPI.queries.byLoggedInUserOrganizerOf();

	const schema = CalendarAPI.schemas.newCalendarEventSchema;
	const validField = createFieldValidator(schema);
</script>

<Main>
	<Form
		heading={m.home_great_fireant_treat()}
		schema={CalendarAPI.schemas.newCalendarEventSchema}
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
		<FormField name={validField('mapPool')} />
	</Form>
</Main>
