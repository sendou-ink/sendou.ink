import { lastCompletedVoting } from "~/features/plus-voting/core/voting-time";
import {
	PLUS_DOWNVOTE,
	PLUS_UPVOTE,
} from "~/features/plus-voting/plus-voting-constants";
import { faker } from "../core/faker";
import * as PlusSuggestionFactory from "../factories/PlusSuggestionFactory";
import * as PlusVoteFactory from "../factories/PlusVoteFactory";
import type { SeededUsers } from "./users";

const TIER_SIZES = [30, 50, 70];
const FAILED_PER_TIER = 8;
const SUGGESTED_COUNT = 110;

export async function seedPlus(users: SeededUsers) {
	const memberIds = await seedLastMonthsVoting(users);
	await PlusVoteFactory.syncTiers();

	await seedSuggestions(users, memberIds);
}

async function seedLastMonthsVoting(users: SeededUsers) {
	const candidateIds = [
		users.adminId,
		...users.showcaseIds,
		...users.crowdIds.slice(0, 80),
	].filter((id) => id !== users.nzapId);

	const memberIds: number[] = [];
	let nextCandidate = 0;

	for (const [tierIndex, size] of TIER_SIZES.entries()) {
		const tier = tierIndex + 1;

		for (let i = 0; i < size; i++) {
			const votedId = candidateIds[nextCandidate++];
			await PlusVoteFactory.create({
				authorId: users.adminId,
				votedId,
				tier,
				score: PLUS_UPVOTE,
			});
			memberIds.push(votedId);
		}

		for (let i = 0; i < FAILED_PER_TIER; i++) {
			await PlusVoteFactory.create({
				authorId: users.adminId,
				votedId: candidateIds[nextCandidate++],
				tier,
				score: PLUS_DOWNVOTE,
			});
		}
	}

	return memberIds;
}

async function seedSuggestions(users: SeededUsers, memberIds: number[]) {
	const { month, year } = lastCompletedVoting(new Date());
	const suggestableIds = users.crowdIds.slice(100, 100 + SUGGESTED_COUNT * 2);

	for (let i = 0; i < SUGGESTED_COUNT; i++) {
		const suggestedId = suggestableIds[i];
		const isLastMonths = i % 3 === 0;
		const suggesterId = faker.helpers.arrayElement(memberIds);

		await PlusSuggestionFactory.create({
			authorId: suggesterId,
			suggestedId,
			tier: faker.helpers.arrayElement([1, 2, 3]),
			...(isLastMonths ? { month, year } : {}),
		});
	}
}
