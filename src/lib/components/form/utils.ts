export function infoMessageId(fieldId: string) {
	return `${fieldId}-info`;
}

export function errorMessageId(fieldId: string) {
	return `${fieldId}-error`;
}

export function ariaAttributes({
	id,
	error,
	bottomText
}: {
	id: string;
	error?: string;
	bottomText?: string;
}) {
	return {
		'aria-invalid': error ? 'true' : undefined,
		'aria-describedby': bottomText ? infoMessageId(id) : undefined,
		'aria-errormessage': error ? errorMessageId(id) : undefined
	} as const;
}
