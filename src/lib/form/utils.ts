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
		if (key.endsWith('[]')) {
			result[key.replace('[]', '')] = formData.getAll(key);
		} else {
			result[key] = value;
		}
	}

	console.log(result);

	return result;
}
