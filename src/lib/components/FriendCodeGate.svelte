<script lang="ts">
	import * as UserAPI from '$lib/api/user';
	import * as AuthAPI from '$lib/api/auth';
	import type { Snippet } from 'svelte';
	import Form from '$lib/components/form/Form.svelte';
	import FormField from '$lib/components/form/FormField.svelte';
	import { createFieldValidator } from '$lib/components/form/utils';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		children: Snippet;
	}

	const friendCode = await UserAPI.queries.myFriendCode();
	const user = await AuthAPI.queries.me();

	const { children }: Props = $props();

	const schema = UserAPI.schemas.insertFriendCodeSchema;
	const validField = createFieldValidator(schema);
</script>

{#if !user || friendCode}
	{@render children()}
{:else}
	<Form {schema} action={UserAPI.actions.insertFriendCode} heading={m.sea_funny_koala_attend()}>
		<FormField name={validField('friendCode')} />
	</Form>
{/if}
