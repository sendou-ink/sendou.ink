import { confirmDialogState, type ConfirmDialogProps } from '../../routes/globals.svelte';

export function valueArrayToDBFormat<T>(arr: Array<{ value?: T }>) {
	const unwrapped = arr
		.map((item) => {
			if (typeof item.value === 'string' && item.value === '') {
				return null;
			}

			return item.value;
		})
		.filter((item) => item !== null && item !== undefined);

	return unwrapped.length === 0 ? null : unwrapped;
}

export function wrapToValueStringArrayWithDefault(arr?: Array<string> | null) {
	return (
		arr?.map((value) => ({
			value
		})) ?? [{ value: '' }]
	);
}

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
