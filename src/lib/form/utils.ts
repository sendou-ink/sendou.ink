import type { FormField } from './types';
import * as MapPool from '$lib/core/maps/MapPool';

export const fieldTypeToDefaultValue: Partial<Record<FormField['type'], unknown>> = {
	'map-pool': MapPool.empty()
};
