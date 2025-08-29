<script lang="ts">
	import Button from '$lib/components/buttons/Button.svelte';
	import Dialog from '$lib/components/dialog/Dialog.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { Result } from 'neverthrow';
	import { page } from '$app/state';

	interface Props {
		dialogTitle: string;
		onConfirm: () => Promise<void>;
		confirmPending: boolean;
		/** Result of the invite code validation, ok() or err(errMessage) where errMessage is something we can show to user (translated)*/
		validation: Result<unknown, string>;
	}

	const { dialogTitle, onConfirm, confirmPending, validation }: Props = $props();
</script>

<Dialog open isDismissable={false} onCloseTo={page.url.pathname} title={dialogTitle}>
	<div class="stack items-center">
		{#if validation.isErr()}
			<p class="text-warning mt-2 mb-4">
				{validation.error}
			</p>
		{/if}
		<Button class="mt-2" onclick={onConfirm} loading={confirmPending} disabled={validation.isErr()}
			>{m.alive_small_piranha_tend()}</Button
		>
	</div>
</Dialog>
