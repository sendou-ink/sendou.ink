<script lang="ts">
	import * as BuildAPI from '$lib/api/build';
	import Dialog from '$lib/components/dialog/Dialog.svelte';
	import DialogTriggerButton from '$lib/components/dialog/DialogTriggerButton.svelte';
	import Form from '$lib/components/form/Form.svelte';
	import FormField from '$lib/components/form/FormField.svelte';
	import { createFieldValidator } from '$lib/components/form/utils';
	import { m } from '$lib/paraglide/messages';
	import ListOrdered from '@lucide/svelte/icons/list-ordered';

	interface Props {
		buildSorting: BuildAPI.queries.ByUserIdentifierData['buildSorting'];
	}

	let { buildSorting }: Props = $props();

	let open = $state(false);

	const schema = BuildAPI.schemas.updateBuildSortingSchema;
	const validField = createFieldValidator(schema);
</script>

<Dialog bind:open title={m.user_builds_sorting_header()} isDismissable={false}>
	{#snippet trigger()}
		<DialogTriggerButton
			data-testid="change-sorting-button"
			icon={ListOrdered}
			size="small"
			variant="outlined"
		>
			{m.user_builds_sorting_changeButton()}
		</DialogTriggerButton>
	{/snippet}

	<Form
		{schema}
		action={BuildAPI.actions.updateBuildSorting}
		defaultValues={{ buildSorting }}
		onSubmit={() => (open = false)}
	>
		<FormField name={validField('buildSorting')} />
	</Form>
</Dialog>
