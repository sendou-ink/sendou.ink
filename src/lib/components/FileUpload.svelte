<script lang="ts">
	import Button from '$lib/components/buttons/Button.svelte';
	import { logger } from '$lib/utils/logger';
	import Upload from '@lucide/svelte/icons/upload';
	import Trash from '@lucide/svelte/icons/trash';
	import imageCompression from 'browser-image-compression';
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

	function webPWithNoCompression(originalFile: File) {
		const webpFile = new File([originalFile], 'img.webp', {
			type: 'image/webp'
		});

		updateFileState(webpFile);
	}

	function updateFileState(newFile: File) {
		// Attach the compressed image to the input using DataTransfer API

		const dataTransfer = new DataTransfer();
		dataTransfer.items.add(newFile);
		input.files = dataTransfer.files;

		file = newFile;
	}
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
		onchange={async (e) => {
			const uploadedFile = e.currentTarget.files?.[0];
			if (!uploadedFile) {
				file = null;
				return;
			}

			try {
				// Skip compression for very small files (< 5KB) but still convert to WebP for consistency
				if (uploadedFile.size < 5000) {
					return webPWithNoCompression(uploadedFile);
				}

				const compressedFile = await imageCompression(uploadedFile, {
					maxWidthOrHeight: Math.max(dimensions.width, dimensions.height),
					maxSizeMB: 1,
					fileType: 'image/webp',
					initialQuality: 0.8
				});

				// Use original file (as webp) if compression didn't reduce size significantly
				if (compressedFile.size > uploadedFile.size * 0.9) {
					return webPWithNoCompression(uploadedFile);
				}

				const finalFile = new File([compressedFile], 'img.webp', {
					type: 'image/webp'
				});

				updateFileState(finalFile);
			} catch (err) {
				logger.error('Image compression failed:', err);
				// Fall back to original file
				file = uploadedFile;
			}
		}}
	/>
</div>

<style>
	input {
		display: none;
	}
</style>
