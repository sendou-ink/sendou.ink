<script lang="ts">
	import * as UserAPI from '$lib/api/user';
	import * as AuthAPI from '$lib/api/auth';
	import Form from '$lib/components/form/Form.svelte';
	import FormField from '$lib/components/form/FormField.svelte';

	let { params } = $props();

	const loggedInUser = $derived(await AuthAPI.queries.me());
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
	<FormField name="battlefy" />
	<FormField name="bio" />
	<FormField name="hideDiscordUniqueName" />
	{#if loggedInUser?.roles.includes('ARTIST')}
		<FormField name="commissionsOpen" />
		<FormField name="commissionText" />
	{/if}
</Form>
