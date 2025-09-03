// xxx: should utils/form.ts be here?

export function formDataToObject(formData: FormData): Record<string, unknown> {
	/** @ts-expect-error why is the type missing? */
	const values = formData.entries();

	const result: Record<string, unknown> = {};

	for (const [key, value] of values) {
		const isArrayField = key.endsWith(']');
		const baseKey = isArrayField ? key.split('[')[0] : key;

		if (isArrayField) {
			if (Array.isArray(result[baseKey])) result[baseKey].push(value);
			else result[baseKey] = [value];
		} else {
			result[baseKey] = value;
		}
	}

	return result;
}

export function resolveDefaultValue({ name, defaultValues }: { name: string; defaultValues: any }) {
	const idx = name.match(/\[(\d+)\]$/)?.[1];
	if (idx && defaultValues) {
		const nameWithoutIdx = name.split('[')[0] as keyof typeof defaultValues;
		const defaultValue = defaultValues[nameWithoutIdx]?.[idx];
		if (defaultValue) return defaultValue;
	}

	return defaultValues?.[name as keyof typeof defaultValues];
}
