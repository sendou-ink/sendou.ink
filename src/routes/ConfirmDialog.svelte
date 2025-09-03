<script lang="ts" module>
	import { goto } from '$app/navigation';
	import type { ButtonVariant } from '$lib/components/buttons/Button.svelte';

	export interface ConfirmDialogProps {
		isOpen: boolean;
		title?: string;
		onConfirm?: () => Promise<void>;
		button?: {
			text?: string;
			variant?: ButtonVariant;
		};
		redirectTo?: string;
	}

	export const confirmDialogState = $state<ConfirmDialogProps>({
		isOpen: false
	});
</script>

<script lang="ts">
	import Button from '$lib/components/buttons/Button.svelte';
	import Dialog from '$lib/components/dialog/Dialog.svelte';
	import { m } from '$lib/paraglide/messages';

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
						if (confirmDialogState.redirectTo) {
							goto(confirmDialogState.redirectTo);
						}
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
