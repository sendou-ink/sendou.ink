import { describe, it, expect } from 'vitest';
import * as z from 'zod';
import { resolveFieldsByType } from './form';
import * as Fields from '$lib/form/fields';

describe('resolveFieldsByType', () => {
	it('empty array when no fields of a type', () => {
		const schema = z.object({
			name: Fields.textFieldOptional({ label: 'test', maxLength: 10 })
		});

		const result = resolveFieldsByType(schema, 'file');
		expect(result).toEqual([]);
	});

	it('returns keys when matching type exists', () => {
		const schema = z.object({
			name: Fields.textFieldOptional({ label: 'test', maxLength: 10 }),
			photo: Fields.imageOptional({ label: 'Photo', dimensions: 'logo' })
		});

		const result = resolveFieldsByType(schema, 'file');
		expect(result).toEqual(['photo']);
	});
});
