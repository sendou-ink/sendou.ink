<script lang="ts">
	import Form from '$lib/components/form/Form.svelte';
	import FormField from '$lib/components/form/FormField.svelte';
	import { createFieldValidator } from '$lib/components/form/utils';
	import * as TeamAPI from '$lib/api/team';
	import Main from '$lib/components/layout/Main.svelte';

	const schema = TeamAPI.schemas.createTeamSchema;
	const validField = createFieldValidator(schema);
</script>

<Main>
	<Form {schema} action={TeamAPI.actions.create} heading="Creating a new team">
		<FormField name={validField('name')} />
	</Form>
</Main>
