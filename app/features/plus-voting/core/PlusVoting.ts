import * as R from "remeda";
import { PLUS_VOTING_CRITERIA } from "../plus-voting-constants";

interface RawVotingResult {
	votedId: number;
	tier: number;
	score: number;
	wasSuggested: number;
}

interface VotingResultWithPassed extends RawVotingResult {
	passedVoting: number;
}

export function computePassedVoting(
	results: RawVotingResult[],
): VotingResultWithPassed[] {
	const byTier = R.groupBy(results, (r) => r.tier);

	return Object.entries(byTier).flatMap(([tierStr, tierResults]) => {
		const tier = Number(tierStr) as keyof typeof PLUS_VOTING_CRITERIA;
		const criteria = PLUS_VOTING_CRITERIA[tier];

		const passAvg = percentageToDbAvg(criteria.passPercentage);
		const failAvg = percentageToDbAvg(criteria.failPercentage);

		const autoPassers = tierResults.filter((r) => r.score >= passAvg);
		const autoFailers = tierResults.filter((r) => r.score <= failAvg);
		const middleZone = tierResults
			.filter((r) => r.score > failAvg && r.score < passAvg)
			.sort((a, b) => b.score - a.score);

		const remainingSlots = Math.max(0, criteria.quota - autoPassers.length);

		return [
			...autoPassers.map((r) => ({ ...r, passedVoting: 1 as number })),
			...autoFailers.map((r) => ({ ...r, passedVoting: 0 as number })),
			...middleZone.map((r, i) => ({
				...r,
				passedVoting: i < remainingSlots ? (1 as number) : (0 as number),
			})),
		];
	});
}

export function computeFreshPlusTiers(
	results: VotingResultWithPassed[],
): { userId: number; plusTier: number }[] {
	const byUser = R.groupBy(results, (r) => r.votedId);

	const output: { userId: number; plusTier: number }[] = [];

	for (const [userIdStr, userResults] of Object.entries(byUser)) {
		const effectiveTiers: number[] = [];

		for (const r of userResults) {
			if (r.passedVoting) {
				effectiveTiers.push(r.tier);
			} else if (!r.wasSuggested && r.tier !== 3) {
				effectiveTiers.push(r.tier + 1);
			}
		}

		if (effectiveTiers.length === 0) continue;

		output.push({
			userId: Number(userIdStr),
			plusTier: Math.min(...effectiveTiers),
		});
	}

	return output;
}

function percentageToDbAvg(percentage: number) {
	return (2 * percentage - 100) / 100;
}
