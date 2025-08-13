import { confirmDialogState, type ConfirmDialogProps } from '../../routes/ConfirmDialog.svelte';

/** Displays a confirmation dialog to the user, if they confirm the action then the server function is called */
export function confirmAction(
	action: NonNullable<ConfirmDialogProps['onConfirm']>,
	args?: {
		title: string;
		button?: ConfirmDialogProps['button'];
	}
) {
	confirmDialogState.isOpen = true;
	confirmDialogState.title = args?.title;
	confirmDialogState.button = args?.button;
	confirmDialogState.onConfirm = action;
}
