import type { ZodObject } from 'zod';
import z from 'zod';

export function infoMessageId(fieldId: string) {
	return `${fieldId}-info`;
}

export function errorMessageId(fieldId: string) {
	return `${fieldId}-error`;
}

export function ariaAttributes({
	id,
	error,
	bottomText,
	required
}: {
	id: string;
	error?: string;
	bottomText?: string;
	required?: boolean;
}) {
	return {
		'aria-invalid': error ? 'true' : undefined,
		'aria-describedby': bottomText ? infoMessageId(id) : undefined,
		'aria-errormessage': error ? errorMessageId(id) : undefined,
		'aria-required': required ? 'true' : undefined
	} as const;
}

export function createFieldValidator<T extends ZodObject<any>>(_schema: T) {
	return function validField<K extends keyof z.output<T>>(fieldName: K): K {
		return fieldName;
	};
}
