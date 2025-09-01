import type { FormField } from './types';
import * as MapPool from '$lib/core/maps/MapPool';

export function formDataToObject(formData: FormData): Record<string, unknown> {
	/** @ts-expect-error why is the type missing? */
	const values = formData.entries();

	const result: Record<string, unknown> = {};

	for (const [key, value] of values) {
		const baseKey = key.endsWith(']') ? key.split('[')[0] : key;

		if (result[baseKey]) {
			if (Array.isArray(result[baseKey])) result[baseKey].push(value);
			else result[baseKey] = [result[baseKey], value];
		} else {
			result[baseKey] = value;
		}
	}

	return result;
}

const fieldTypeToDefaultValue: Partial<Record<FormField['type'], unknown>> = {
	'map-pool': MapPool.empty()
};

export function resolveDefaultValue({
	name,
	defaultValues,
	field
}: {
	name: string;
	defaultValues: any;
	field: FormField;
}) {
	const idx = name.match(/\[(\d+)\]$/)?.[1];
	if (idx && defaultValues) {
		const nameWithoutIdx = name.split('[')[0] as keyof typeof defaultValues;
		const defaultValue = defaultValues[nameWithoutIdx]?.[idx];
		if (defaultValue) return defaultValue;
	}

	return defaultValues?.[name as keyof typeof defaultValues] ?? fieldTypeToDefaultValue[field.type];
}
