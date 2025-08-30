import { describe, expect, test } from 'vitest';
import { formDataToObject } from './utils';

describe('formDataToObject()', () => {
	test('converts simple FormData to object', () => {
		const fd = new FormData();
		fd.append('username', 'alice');
		fd.append('age', '30');
		expect(formDataToObject(fd)).toEqual({ username: 'alice', age: '30' });
	});

	test('handles array fields with [] suffix', () => {
		const fd = new FormData();
		fd.append('tags[]', 'tag1');
		fd.append('tags[]', 'tag2');
		expect(formDataToObject(fd)).toEqual({ tags: ['tag1', 'tag2'] });
	});

	test('handles mix of single and array fields', () => {
		const fd = new FormData();
		fd.append('name', 'bob');
		fd.append('roles[]', 'admin');
		fd.append('roles[]', 'user');
		expect(formDataToObject(fd)).toEqual({ name: 'bob', roles: ['admin', 'user'] });
	});

	test('handles empty FormData', () => {
		const fd = new FormData();
		expect(formDataToObject(fd)).toEqual({});
	});

	test('handles multiple different array fields', () => {
		const fd = new FormData();
		fd.append('colors[]', 'red');
		fd.append('colors[]', 'blue');
		fd.append('fruits[]', 'apple');
		fd.append('fruits[]', 'banana');
		expect(formDataToObject(fd)).toEqual({
			colors: ['red', 'blue'],
			fruits: ['apple', 'banana']
		});
	});

	test('handles fields with [] in the middle of the key', () => {
		const fd = new FormData();
		fd.append('foo[]bar', 'baz');
		expect(formDataToObject(fd)).toEqual({ 'foo[]bar': 'baz' });
	});
});
