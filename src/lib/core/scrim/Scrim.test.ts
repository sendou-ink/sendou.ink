import { describe, expect, it } from 'vitest';
import * as Scrim from './Scrim';
import type { ScrimPost } from './types';

type MockUser = { id: number };
type MockRequest = { isAccepted: boolean; users: MockUser[] };

function createPost(users: MockUser[], requests: MockRequest[]): ScrimPost {
	return {
		id: 1,
		users,
		requests,
		createdAt: '',
		updatedAt: '',
		title: '',
		description: '',
		status: 'open',
		authorId: 0
	} as unknown as ScrimPost;
}

describe('participantIdsListFromAccepted', () => {
	it('returns only post users if no accepted request', () => {
		const post = createPost(
			[{ id: 10 }, { id: 20 }],
			[
				{
					isAccepted: false,
					users: [{ id: 30 }]
				}
			]
		);

		const result = Scrim.participantIdsListFromAccepted(post);
		expect(result).toEqual([10, 20]);
	});

	it('returns post users and accepted request users', () => {
		const post = createPost(
			[{ id: 10 }, { id: 20 }],
			[
				{
					isAccepted: false,
					users: [{ id: 30 }]
				},
				{
					isAccepted: true,
					users: [{ id: 40 }, { id: 50 }]
				}
			]
		);

		const result = Scrim.participantIdsListFromAccepted(post);
		expect(result).toEqual([10, 20, 40, 50]);
	});

	it('returns post users if accepted request has no users', () => {
		const post = createPost(
			[{ id: 10 }],
			[
				{
					isAccepted: true,
					users: []
				}
			]
		);

		const result = Scrim.participantIdsListFromAccepted(post);
		expect(result).toEqual([10]);
	});

	it('returns empty array if no users and no accepted request', () => {
		const post = createPost([], []);

		const result = Scrim.participantIdsListFromAccepted(post);
		expect(result).toEqual([]);
	});
});
