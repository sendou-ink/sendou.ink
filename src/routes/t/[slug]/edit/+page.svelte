<script>
	import Form from '$lib/components/form/Form.svelte';
	import * as TeamAPI from '$lib/api/team';
	import FormField from '$lib/components/form/FormField.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import GoBackButton from '../GoBackButton.svelte';

	const { params } = $props();
</script>

<div class="stack lg">
	<GoBackButton slug={params.slug} />
	<Form
		heading={m.proof_patchy_lark_fall()}
		action={TeamAPI.actions.edit}
		schema={TeamAPI.schemas.editTeamSchema}
		defaultValues={await TeamAPI.queries.editTeamFormData(params.slug)}
	>
		<FormField name={TeamAPI.actions.edit.field('name')} />
		<FormField name={TeamAPI.actions.edit.field('bsky')} />
		<FormField name={TeamAPI.actions.edit.field('bio')} />
		<FormField name={TeamAPI.actions.edit.field('logo')} />
		<FormField name={TeamAPI.actions.edit.field('banner')} />

		<FormField name={TeamAPI.actions.edit.field('slug')} />

		<input type="hidden" name="theme" value="" />
	</Form>
</div>
