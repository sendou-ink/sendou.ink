<script lang="ts">
	import Form from '$lib/components/form/Form.svelte';
	import FormField from '$lib/components/form/FormField.svelte';
	import * as SettingsAPI from '$lib/api/settings';
	import { createFieldValidator } from '$lib/components/form/utils';
	import { m } from '$lib/paraglide/messages';

	const schema = SettingsAPI.schemas.updateMatchProfileSchema;
	const validField = createFieldValidator(schema);

	const defaultValues = await SettingsAPI.queries.matchProfile();

	let modes = $state(defaultValues.modes);
</script>

<Form
	{schema}
	action={SettingsAPI.actions.updateMatchProfile}
	{defaultValues}
	heading={m.keen_main_bear_reside()}
	info={m.due_main_salmon_trust()}
	onchange={(data) => {
		if (data.modes) modes = data.modes;
	}}
>
	<FormField name={validField('qWeaponPool')} />
	<FormField name={validField('vc')} />
	<FormField name={validField('languages')} />
	<FormField name={validField('modes')} />
</Form>
