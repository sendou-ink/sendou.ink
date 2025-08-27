import { confirmDialogState, type ConfirmDialogProps } from '../../routes/ConfirmDialog.svelte';
import * as z from 'zod';

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

export function resolveFieldsByType<T extends z.ZodObject>(formSchema: T, type: string) {
	return Object.entries(formSchema.shape)
		.filter(([, field]) => schemaHasType(field as z.ZodType, type))
		.map(([key]) => key);
}

function schemaHasType(zodSchema: z.ZodType, type: string): boolean {
	// @ts-expect-error TODO: figure out the typing for this function
	const out = zodSchema.out;

	if (out) {
		return schemaHasType(out, type);
	}

	if (
		zodSchema instanceof z.ZodOptional ||
		zodSchema instanceof z.ZodNullable ||
		zodSchema instanceof z.ZodDefault
	) {
		return schemaHasType(zodSchema.def.innerType as z.ZodType, type);
	}

	return zodSchema.def.type === type;
}
