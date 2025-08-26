<script>
	import Form from '$lib/components/form/Form.svelte';
	import * as TeamAPI from '$lib/api/team';
	import FormField from '$lib/components/form/FormField.svelte';
	import { createFieldValidator } from '$lib/components/form/utils';
	import { m } from '$lib/paraglide/messages.js';
	import GoBackButton from '../GoBackButton.svelte';

	const { params } = $props();

	const schema = TeamAPI.schemas.editTeamSchema;
	const validField = createFieldValidator(schema);
</script>

<div class="stack lg">
	<GoBackButton slug={params.slug} />
	<Form
		heading={m.proof_patchy_lark_fall()}
		action={TeamAPI.actions.edit}
		schema={TeamAPI.schemas.editTeamSchema}
		defaultValues={await TeamAPI.queries.editTeamFormData(params.slug)}
	>
		<FormField name={validField('name')} />
		<FormField name={validField('bsky')} />
		<FormField name={validField('bio')} />
		<FormField name={validField('logo')} />
		<FormField name={validField('banner')} />

		<FormField name={validField('slug')} />
	</Form>
</div>
