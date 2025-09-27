<script lang="ts">
	import * as UserAPI from '$lib/api/user';
	import * as AuthAPI from '$lib/api/auth';
	import Form from '$lib/components/form/Form.svelte';
	import FormField from '$lib/components/form/FormField.svelte';
	import { createFieldValidator } from '$lib/components/form/utils.js';
	import FavoriteBadgeField from './FavoriteBadgeField.svelte';
	import { m } from '$lib/paraglide/messages';

	let { params } = $props();

	const loggedInUser = $derived(await AuthAPI.queries.me());

	const schema = UserAPI.schemas.editProfileSchema;
	const validField = createFieldValidator(schema);
	const defaultValues = $derived(await UserAPI.queries.editProfileFormData(params.identifier));

	let country = $state(defaultValues?.country ?? null);
</script>

<Form
	{schema}
	action={UserAPI.actions.updateProfile}
	{defaultValues}
	heading={m.user_forms_editProfile_heading()}
	onchange={(field) => {
		if (field.country) {
			country = field.country;
		}
	}}
>
	{#if loggedInUser?.roles.includes('SUPPORTER')}
		<FormField name={validField('theme')} />
	{/if}
	<FormField name={validField('customName')} />
	<FormField name={validField('customUrl')} />
	<FormField name={validField('inGameName')} />
	<FormField name={validField('sens')} />
	<FormField name={validField('battlefy')} />
	<FormField name={validField('country')} />
	{#if country === 'US'}
		<FormField name={validField('region')} />
	{/if}
	<FormField name={validField('favoriteBadges')}>
		{#snippet children({ data, ...rest })}
			<FavoriteBadgeField bind:value={data.value as number[]} {...rest} />
		{/snippet}
	</FormField>
	<FormField name={validField('weapons')} />
	<FormField name={validField('bio')} />
	<FormField name={validField('hideDiscordUniqueName')} />
	{#if loggedInUser?.roles.includes('ARTIST')}
		<FormField name={validField('commissionsOpen')} />
		<FormField name={validField('commissionText')} />
	{/if}
</Form>
