<script lang="ts">
	import Button from '$lib/components/buttons/Button.svelte';
	import invariant from '$lib/utils/invariant';
	import { logger } from '$lib/utils/logger';
	import Upload from '@lucide/svelte/icons/upload';
	import Trash from '@lucide/svelte/icons/trash';
	import Compressor from 'compressorjs';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		name: string;
		file: File | null;
		dimensions: {
			width: number;
			height: number;
		};
		radius: 'round' | 'box';
	}

	let { name, file = $bindable(), dimensions, radius }: Props = $props();

	let input: HTMLInputElement;
</script>

<div class="stack md items-start">
	{#if file}
		<img
			src={URL.createObjectURL(file)}
			alt=""
			style="width: {dimensions.width / 3}px; height: {dimensions.height /
				3}px; border-radius: {radius === 'round' ? '100%' : 'var(--radius-box)'};"
		/>
		<Button size="miniscule" variant="destructive" icon={Trash} onclick={() => (file = null)}
			>{m.common_actions_delete()}</Button
		>
	{:else}
		<Button size="small" icon={Upload} onclick={() => input.click()}
			>{m.common_actions_upload()}</Button
		>
	{/if}

	<input
		bind:this={input}
		type="file"
		{name}
		accept="image/png, image/jpeg, image/jpg, image/webp"
		onchange={(e) => {
			const uploadedFile = e.currentTarget.files?.[0];
			if (!uploadedFile) {
				file = null;
				return;
			}

			new Compressor(uploadedFile, {
				width: dimensions.width,
				height: dimensions.height,
				maxHeight: dimensions.height,
				maxWidth: dimensions.width,
				resize: 'cover',
				success(result) {
					invariant(result instanceof Blob);
					const compressedFile = new File([result], 'img.webp', {
						type: 'image/webp'
					});

					file = compressedFile;
				},
				error(err) {
					logger.error(err.message);
				}
			});
		}}
	/>
</div>

<style>
	input {
		display: none;
	}
</style>
