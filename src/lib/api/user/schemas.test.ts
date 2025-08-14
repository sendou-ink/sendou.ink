import { describe, expect, test } from 'vitest';
import { customUrlRegexp, inGameNameRegexp } from './schemas';

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

describe('inGameNameRegexp', () => {
	const validNames = [
		'Player#1234',
		'ユーザー#abcd',
		'Name#1a2b',
		'TestUser#0000',
		'あいうえお#1a2b3',
		'Name#abcde',
		'Name#00000',
		'漢字#1a2b3'
	];

	const invalidNames = [
		'Player1234',
		'#1234',
		'Player#12',
		'Player#123456',
		'Player#ABCD',
		'Player#12 34',
		'12345#1234',
		'Player#',
		'Player#12!',
		'Player#abcdE',
		'Player#',
		'Player#12_34'
	];

	test.each(validNames)('matches valid in-game name: "%s"', (name) => {
		expect(inGameNameRegexp.test(name)).toBe(true);
	});

	test.each(invalidNames)('does not match invalid in-game name: "%s"', (name) => {
		expect(inGameNameRegexp.test(name)).toBe(false);
	});
});
