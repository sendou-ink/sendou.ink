<script lang="ts">
	import * as UserAPI from '$lib/api/user';
	import Form from '$lib/components/form/Form.svelte';
	import FormField from '$lib/components/form/FormField.svelte';

	let { params } = $props();
</script>

<Form
	action={UserAPI.actions.updateProfile}
	schema={UserAPI.schemas.editProfileSchema}
	defaultValues={await UserAPI.queries.editProfileFormData(params.identifier)}
	heading="Editing user profile"
>
	<FormField name="customName" />
	<FormField name="customUrl" />
	<FormField name="inGameName" />
	<FormField name="bio" />
	<FormField name="hideDiscordUniqueName" />
	<FormField name="commissionsOpen" />
</Form>
