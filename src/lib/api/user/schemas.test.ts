import { describe, expect, test } from 'vitest';
import { customUrlRegexp } from './schemas';

describe('customUrlRegexp', () => {
	const validUrls = [
		'username',
		'UserName',
		'user_name',
		'user-name',
		'user123',
		'USER_123',
		'abc-DEF_123',
		'a_b-c',
		'abc123def456',
		'abc_def-ghi'
	];

	const invalidUrls = ['123456', '😎😎😎', 'ääretön'];

	test.each(validUrls)('matches valid custom url: "%s"', (url) => {
		expect(customUrlRegexp.test(url)).toBe(true);
	});

	test.each(invalidUrls)('does not match invalid custom url: "%s"', (url) => {
		expect(customUrlRegexp.test(url)).toBe(false);
	});
});
