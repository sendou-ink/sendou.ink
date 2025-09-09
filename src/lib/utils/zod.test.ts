import { describe, expect, it } from 'vitest';
import { actuallyNonEmptyStringOrNull, hasZalgo } from './zod';

describe('hasZalgo', () => {
	it('returns true for text containing Zalgo characters', () => {
		expect(hasZalgo('z͎͗ͣḁ̵̑l̉̃ͦg̐̓̒o͓̔ͥ')).toBe(true);
	});

	it('returns false for text without Zalgo characters', () => {
		expect(hasZalgo('normal text')).toBe(false);
	});

	it('returns false for an empty string', () => {
		expect(hasZalgo('')).toBe(false);
	});

	it('returns false for text with special but non-Zalgo characters', () => {
		expect(hasZalgo('!@#$%^&*()')).toBe(false);
	});

	it('accepts japanese characters', () => {
		expect(hasZalgo('こんにちは')).toBe(false);
	});
});

describe('actuallyNonEmptyStringOrNull', () => {
	it('returns null for an empty string', () => {
		expect(actuallyNonEmptyStringOrNull('')).toBeNull();
	});

	it('returns null for a string with only spaces', () => {
		expect(actuallyNonEmptyStringOrNull('    ')).toBeNull();
	});

	it('returns trimmed string for a string with visible characters and spaces', () => {
		expect(actuallyNonEmptyStringOrNull('  hello world  ')).toBe('hello world');
	});

	it('removes invisible characters and trims', () => {
		expect(actuallyNonEmptyStringOrNull('​​​​test​​​​')).toBe('test');
	});

	it('returns original value if not a string', () => {
		expect(actuallyNonEmptyStringOrNull(123)).toBe(123);
		expect(actuallyNonEmptyStringOrNull(null)).toBe(null);
		expect(actuallyNonEmptyStringOrNull(undefined)).toBe(undefined);
		expect(actuallyNonEmptyStringOrNull({})).toEqual({});
	});

	it('returns null for a string with only zero width spaces', () => {
		expect(actuallyNonEmptyStringOrNull('​​​​​​​​​​')).toBeNull();
	});

	it('returns null for a string with only tag space emoji', () => {
		expect(actuallyNonEmptyStringOrNull('󠀠󠀠󠀠󠀠󠀠')).toBeNull();
	});
});
