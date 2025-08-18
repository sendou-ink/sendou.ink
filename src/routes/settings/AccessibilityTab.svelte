<script lang="ts">
	import Form from '$lib/components/form/Form.svelte';
	import FormField from '$lib/components/form/FormField.svelte';
	import * as SettingsAPI from '$lib/api/settings';
	import { createFieldValidator } from '$lib/components/form/utils';
	import { m } from '$lib/paraglide/messages';

	const schema = SettingsAPI.schemas.updateAccessibilitySettingsSchema;
	const validField = createFieldValidator(schema);
</script>

<Form
	{schema}
	action={SettingsAPI.actions.updateAccessibilitySettings}
	defaultValues={await SettingsAPI.queries.prefersNoScreen()}
	heading={m.topical_steep_panther_honor()}
>
	<FormField name={validField('noScreen')} />
</Form>
