<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Dialog from '$lib/components/dialog/Dialog.svelte';
	import { m } from '$lib/paraglide/messages';
	import { confirmDialogState } from './globals.svelte';

	let isSubmitting = $state(false);
</script>

<Dialog bind:open={confirmDialogState.isOpen}>
	<div class="stack md">
		<h2 class="text-md text-center">{confirmDialogState.title}</h2>
		<div class="stack horizontal md justify-center mt-2">
			<Button
				variant={confirmDialogState.button?.variant ?? 'destructive'}
				disabled={isSubmitting}
				onclick={async () => {
					isSubmitting = true;
					try {
						await confirmDialogState.onConfirm?.();
					} catch (error) {
						console.error('Error during confirmation action:', error);
					} finally {
						isSubmitting = false;
						confirmDialogState.isOpen = false;
					}
				}}>{confirmDialogState.button?.text ?? m.common_actions_delete()}</Button
			>
		</div>
	</div>
</Dialog>
