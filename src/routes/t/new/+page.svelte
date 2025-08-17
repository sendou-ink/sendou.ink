<script lang="ts">
	import Form from '$lib/components/form/Form.svelte';
	import FormField from '$lib/components/form/FormField.svelte';
	import { createFieldValidator } from '$lib/components/form/utils';
	import * as TeamAPI from '$lib/api/team';
	import Main from '$lib/components/layout/Main.svelte';
	import { m } from '$lib/paraglide/messages';
	import OpenGraphMeta from '$lib/components/OpenGraphMeta.svelte';

	const schema = TeamAPI.schemas.createTeamSchema;
	const validField = createFieldValidator(schema);
</script>

<OpenGraphMeta title="New team" />

<Main>
	<Form {schema} action={TeamAPI.actions.create} heading={m.team_newTeam_header()}>
		<FormField name={validField('name')} />
	</Form>
</Main>
