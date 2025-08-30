<script lang="ts">
	import Form from '$lib/components/form/Form.svelte';
	import * as CalendarAPI from '$lib/api/calendar';
	import FormField from '$lib/components/form/FormField.svelte';
	import { createFieldValidator } from '$lib/components/form/utils';
	import Main from '$lib/components/layout/Main.svelte';

	const schema = CalendarAPI.schemas.newCalendarEventSchema;
	const validField = createFieldValidator(schema);
</script>

<Main>
	<Form
		heading="Creating a new calendar event"
		schema={CalendarAPI.schemas.newCalendarEventSchema}
		action={CalendarAPI.actions.upsertEvent}
	>
		<FormField name={validField('name')} />
		<FormField name={validField('description')} />
		<FormField name={validField('bracketUrl')} />
		<FormField name={validField('discordInviteCode')} />
		<FormField name={validField('tags')} />
		<FormField name={validField('mapPool')} />
	</Form>
</Main>
