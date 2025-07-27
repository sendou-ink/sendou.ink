import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { userDiscordIdIsAged } from './utils';

describe('userDiscordIdIsAged()', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2023-11-25T00:00:00.000Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test('returns false if discord id is not aged', () => {
		expect(userDiscordIdIsAged({ discordId: '1177730652641181871' })).toBe(false);
	});

	test('returns true if discord id is aged', () => {
		expect(userDiscordIdIsAged({ discordId: '79237403620945920' })).toBe(true);
	});

	test('return false if discord id missing', () => {
		expect(userDiscordIdIsAged({ discordId: '' })).toBe(false);
	});

	test('return false if discord id too short', () => {
		expect(userDiscordIdIsAged({ discordId: '1234' })).toBe(false);
	});
});
