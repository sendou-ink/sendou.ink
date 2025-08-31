import type { FormField } from './types';
import * as MapPool from '$lib/core/maps/MapPool';

export const fieldTypeToDefaultValue: Partial<Record<FormField['type'], unknown>> = {
	'map-pool': MapPool.empty()
};

export function formDataToObject(formData: FormData): Record<string, unknown> {
	/** @ts-expect-error why is the type missing? */
	const values = formData.entries();

	const result: Record<string, unknown> = {};

	for (const [key, value] of values) {
		if (key.endsWith(']')) {
			const baseKey = key.split('[')[0];

			if (Array.isArray(result[baseKey])) result[baseKey].push(value);
			else result[baseKey] = [value];
		} else {
			result[key] = value;
		}
	}

	return result;
}
