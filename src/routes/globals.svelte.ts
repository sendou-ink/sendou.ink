import type { ButtonVariant } from '$lib/components/buttons/Button.svelte';

export interface ConfirmDialogProps {
	isOpen: boolean;
	title?: string;
	onConfirm?: () => Promise<void>;
	button?: {
		text?: string;
		variant?: ButtonVariant;
	};
}

export const confirmDialogState = $state<ConfirmDialogProps>({
	isOpen: false
});
