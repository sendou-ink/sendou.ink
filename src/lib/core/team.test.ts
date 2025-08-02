import { describe, expect, it } from 'vitest';
import { subsOfResult } from './team';

describe('subsOfResult()', () => {
	it('returns empty array if all participants are current members', () => {
		const result = {
			participants: [{ id: 1 }, { id: 2 }],
			startTime: new Date(1000)
		};
		const members = [
			{ userId: 1, createdAt: new Date(500), leftAt: null },
			{ userId: 2, createdAt: new Date(600), leftAt: null }
		];
		const subs = subsOfResult(result, members);
		expect(subs).toEqual([]);
	});

	it('returns participant not in members as sub', () => {
		const result = {
			participants: [{ id: 1 }, { id: 2 }],
			startTime: new Date(1000)
		};
		const members = [{ userId: 1, createdAt: new Date(500), leftAt: null }];
		const subs = subsOfResult(result, members);
		expect(subs).toEqual([{ id: 2 }]);
	});

	it('returns participant as sub if they left before result startTime', () => {
		const result = {
			participants: [{ id: 1 }, { id: 2 }],
			startTime: new Date(1000)
		};
		const members = [
			{ userId: 1, createdAt: new Date(500), leftAt: new Date(900) },
			{ userId: 2, createdAt: new Date(600), leftAt: null }
		];
		const subs = subsOfResult(result, members);
		expect(subs).toEqual([{ id: 1 }]);
	});

	it('does not return participant as sub if they were a member during result', () => {
		const result = {
			participants: [{ id: 1 }, { id: 2 }],
			startTime: new Date(1000)
		};
		const members = [
			{ userId: 1, createdAt: new Date(500), leftAt: new Date(2000) },
			{ userId: 2, createdAt: new Date(600), leftAt: null }
		];
		const subs = subsOfResult(result, members);
		expect(subs).toEqual([]);
	});

	it('returns multiple subs correctly', () => {
		const result = {
			participants: [{ id: 1 }, { id: 2 }, { id: 3 }],
			startTime: new Date(1000)
		};
		const members = [
			{ userId: 1, createdAt: new Date(500), leftAt: new Date(900) },
			{ userId: 2, createdAt: new Date(600), leftAt: null }
		];
		const subs = subsOfResult(result, members);
		expect(subs).toEqual([{ id: 1 }, { id: 3 }]);
	});

	it('returns empty array if no participants', () => {
		const result = {
			participants: [],
			startTime: new Date(1000)
		};
		const members = [{ userId: 1, createdAt: new Date(500), leftAt: null }];
		const subs = subsOfResult(result, members);
		expect(subs).toEqual([]);
	});
});
