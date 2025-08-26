<script lang="ts">
	import FileUpload from '$lib/components/FileUpload.svelte';
	import type { FormFieldProps } from '$lib/form/types';
	import BottomText from './BottomText.svelte';
	import Label from './Label.svelte';

	type Props = FormFieldProps<'image'> & {
		value: File | null;
	};

	let { label, name, dimensions, value = $bindable() }: Props = $props();
	const id = $props.id();

	const { width, height } = $derived(
		dimensions === 'logo' ? { width: 400, height: 400 } : { width: 1000, height: 500 }
	);
</script>

<!--- xxx: when editing, show if validation is in progress -->
<!--- xxx: button to delete the image, server handles -->
<!--- xxx: should have 3 submit values: input type="file",  -->

<div class="stack xs">
	<Label for={id}>
		{label}
	</Label>
	<FileUpload
		{name}
		bind:file={value}
		dimensions={{ width, height }}
		radius={dimensions === 'logo' ? 'round' : 'box'}
	/>
	<BottomText
		info={`Recommended size is ${width}x${height}. Note that non-supporters need to wait for moderator validation before the image is shown to others.`}
		fieldId={id}
	/>
</div>
