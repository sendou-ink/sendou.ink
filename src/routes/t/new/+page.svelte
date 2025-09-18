<script lang="ts">
	import Form from '$lib/components/form/Form.svelte';
	import FormField from '$lib/components/form/FormField.svelte';
	import * as TeamAPI from '$lib/api/team';
	import Main from '$lib/components/layout/Main.svelte';
	import { m } from '$lib/paraglide/messages';
	import OpenGraphMeta from '$lib/components/OpenGraphMeta.svelte';
	import Dialog from '$lib/components/dialog/Dialog.svelte';
</script>

<OpenGraphMeta title="New team" />

<Main>
	{#if !(await TeamAPI.queries.canCreateTeam())}
		<Dialog open title={m.teary_pretty_jannes_quiz()} onCloseTo="/">
			{m.calm_chunky_goldfish_dance()}
		</Dialog>
	{/if}
	<Form
		schema={TeamAPI.schemas.createTeamSchema}
		action={TeamAPI.actions.create}
		heading={m.team_newTeam_header()}
	>
		<FormField name={TeamAPI.actions.create.field('name')} />
	</Form>
</Main>
