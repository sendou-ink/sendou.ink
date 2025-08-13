<script lang="ts">
	import * as UserAPI from '$lib/api/user';
	import Form from '$lib/components/form/Form.svelte';
	import FormField from '$lib/components/form/FormField.svelte';
</script>

<Form action={{}} schema={UserAPI.schemas.userEditActionSchemaNew} heading="Editing user profile">
	<FormField name="customName" />
	<FormField name="bio" />
	<FormField name="showDiscordUniqueName" />
	<FormField name="commissionsOpen" />
</Form>
