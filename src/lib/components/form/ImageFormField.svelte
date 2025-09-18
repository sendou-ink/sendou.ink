<script lang="ts">
	import FileUpload from '$lib/components/FileUpload.svelte';
	import type { FormFieldProps } from '$lib/form/types';
	import { m } from '$lib/paraglide/messages';
	import { userSubmittedImage } from '$lib/utils/urls-img';
	import Button from '../buttons/Button.svelte';
	import BottomText from './BottomText.svelte';
	import Label from './Label.svelte';
	import Trash from '@lucide/svelte/icons/trash';

	type Props = FormFieldProps<'image'> & {
		value: File | string | null;
	};

	let { label, name, dimensions, value = $bindable() }: Props = $props();
	const id = $props.id();

	const { width, height } = $derived(
		dimensions === 'logo' ? { width: 400, height: 400 } : { width: 1000, height: 500 }
	);
</script>

<!--- xxx: when editing, show if validation is in progress -->

<div class="stack xs">
	<Label for={id}>
		{label}
	</Label>
	{#if typeof value === 'string'}
		<div class="stack md items-start">
			<img
				src={userSubmittedImage(value)}
				alt=""
				style="width: {width / 3}px; height: {height / 3}px; border-radius: {dimensions === 'logo'
					? '100%'
					: 'var(--radius-box)'};"
			/>
			<input type="hidden" {name} value="" />
			<Button size="miniscule" variant="destructive" icon={Trash} onclick={() => (value = null)}
				>{m.common_actions_delete()}</Button
			>
		</div>
	{:else}
		<FileUpload
			{name}
			bind:file={value}
			dimensions={{ width, height }}
			radius={dimensions === 'logo' ? 'round' : 'box'}
		/>
	{/if}
	<BottomText
		info={`Recommended size is ${width}x${height}. Note that non-supporters need to wait for moderator validation before the image is shown to others.`}
		fieldId={id}
	/>
</div>
